import { Router } from 'express';
import { isSupabaseConfigured } from '../config/env.js';
import { getSupabaseClient } from '../config/supabase.js';
import {
  getAvailableAppointmentSlots,
  lookupAppointmentByReferenceAndPhone,
} from '../services/appointmentService.js';
import { getIstClock, mapQueueRpcError } from '../services/queueService.js';
import { broadcastQueueChanged } from '../services/realtime.js';
import {
  isValidIsoDate,
  isValidUuid,
  validateAppointmentLookupQuery,
  validateBookAppointmentBody,
  validateExplicitConfirmation,
} from '../utils/validation.js';

export function createAppointmentsRouter({
  getSupabase = getSupabaseClient,
  isConfigured = isSupabaseConfigured,
  broadcast = broadcastQueueChanged,
} = {}) {
  const router = Router();

  /**
   * GET /api/appointments/slots?date=YYYY-MM-DD&serviceIds=uuid1,uuid2&preferredStaffId=uuid
   * Public zero-PII endpoint returning available 30-min slots for future/today dates.
   */
  router.get('/slots', async (req, res) => {
    const rawDate = typeof req.query?.date === 'string' ? req.query.date.trim() : '';
    if (!isValidIsoDate(rawDate)) {
      return res.status(400).json({ success: false, error: 'date must use YYYY-MM-DD format.' });
    }

    const rawServices = typeof req.query?.serviceIds === 'string'
      ? req.query.serviceIds.split(',').map((s) => s.trim()).filter(Boolean)
      : Array.isArray(req.query?.serviceIds)
        ? req.query.serviceIds.map((s) => String(s).trim()).filter(Boolean)
        : [];

    if (rawServices.length < 1 || rawServices.length > 3 || !rawServices.every(isValidUuid)) {
      return res.status(400).json({ success: false, error: 'Select between 1 and 3 valid service IDs.' });
    }

    const serviceIds = [...new Set(rawServices.map((s) => s.toLowerCase()))];
    const rawStaffId = typeof req.query?.preferredStaffId === 'string' ? req.query.preferredStaffId.trim() : '';
    if (rawStaffId && !isValidUuid(rawStaffId)) {
      return res.status(400).json({ success: false, error: 'preferredStaffId must be a valid UUID.' });
    }

    if (!isConfigured()) {
      return res.status(503).json({ success: false, error: 'Database service is not configured.' });
    }

    try {
      const data = await getAvailableAppointmentSlots(getSupabase(), {
        date: rawDate,
        serviceIds,
        preferredStaffId: rawStaffId ? rawStaffId.toLowerCase() : null,
      });

      if (data?.error) {
        return res.status(400).json({ success: false, error: data.error });
      }

      return res.status(200).json({ success: true, data });
    } catch (err) {
      console.error('[CELESTE appointments] GET /slots failed:', err?.message || 'Unknown error');
      return res.status(503).json({ success: false, error: 'Unable to load available appointment slots.' });
    }
  });

  /**
   * POST /api/appointments/book
   * Books a future appointment via book_appointment() RPC (works even when salon is closed).
   */
  router.post('/book', async (req, res) => {
    if (!isConfigured()) {
      return res.status(503).json({ success: false, error: 'Database service is not configured.' });
    }

    const parsed = validateBookAppointmentBody(req.body);
    if (!parsed.ok) {
      return res.status(400).json({ success: false, error: parsed.error });
    }

    const v = parsed.value;
    const supabase = getSupabase();

    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('book_appointment', {
        p_name: v.name,
        p_phone: v.phone,
        p_appointment_date: v.appointmentDate,
        p_start_time: v.startTime,
        p_service_ids: v.serviceIds,
        p_selection_mode: v.selectionMode,
        p_preferred_staff_id: v.preferredStaffId,
        p_is_demo: false,
      });

      if (rpcErr || !rpcRes?.success || !rpcRes?.data?.appointment_id) {
        if (rpcErr) {
          const mapped = mapQueueRpcError(rpcErr);
          return res.status(mapped.status).json({ success: false, code: mapped.code, error: mapped.message });
        }
        return res.status(503).json({ success: false, error: 'Appointment service returned an unexpected response.' });
      }

      await broadcast(
        {
          queue_date: rpcRes.data.appointment_date || getIstClock().date,
          staff_id: rpcRes.data.assigned_staff_id || null,
          action: 'appointment_booked',
        },
        { supabaseClient: supabase }
      );

      return res.status(201).json({
        success: true,
        data: rpcRes.data,
        message: rpcRes.message || 'Appointment booked successfully.',
      });
    } catch (err) {
      console.error('[CELESTE appointments] POST /book failed:', err?.message || 'Unknown error');
      return res.status(503).json({ success: false, error: 'Unable to book appointment right now.' });
    }
  });

  /**
   * GET /api/appointments/lookup?reference=APT-...&phone=9876543210
   * Looks up a customer appointment requiring both reference code and 10-digit phone.
   */
  router.get('/lookup', async (req, res) => {
    const parsed = validateAppointmentLookupQuery(req.query);
    if (!parsed.ok) {
      return res.status(400).json({ success: false, error: parsed.error });
    }
    if (!isConfigured()) {
      return res.status(503).json({ success: false, error: 'Database service is not configured.' });
    }

    try {
      const data = await lookupAppointmentByReferenceAndPhone(getSupabase(), parsed.value);
      if (!data) {
        return res.status(404).json({
          success: false,
          error: 'No appointment matched that reference code and mobile number.',
        });
      }
      return res.status(200).json({ success: true, data });
    } catch (err) {
      console.error('[CELESTE appointments] GET /lookup failed:', err?.message || 'Unknown error');
      return res.status(503).json({ success: false, error: 'Unable to look up appointment right now.' });
    }
  });

  /**
   * POST /api/appointments/:id/cancel
   * Customer cancels their own appointment after phone verification and explicit confirmation.
   */
  router.post('/:id/cancel', async (req, res) => {
    const apptId = req.params?.id;
    if (!isValidUuid(apptId)) {
      return res.status(400).json({ success: false, error: 'Invalid appointment identifier.' });
    }
    const conf = validateExplicitConfirmation(req.body);
    if (!conf.ok) {
      return res.status(400).json({ success: false, error: conf.error });
    }
    const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
    if (!/^[0-9]{10}$/.test(phone)) {
      return res.status(400).json({ success: false, error: '10-digit mobile number is required to verify cancellation.' });
    }
    if (!isConfigured()) {
      return res.status(503).json({ success: false, error: 'Database service is not configured.' });
    }

    const supabase = getSupabase();
    const normalizedId = apptId.trim().toLowerCase();

    try {
      const { data: customer } = await supabase
        .from('customers')
        .select('id')
        .eq('phone', phone)
        .maybeSingle();

      const { data: appt } = await supabase
        .from('appointments')
        .select('id, customer_id')
        .eq('id', normalizedId)
        .maybeSingle();

      if (!appt || !customer || appt.customer_id !== customer.id) {
        return res.status(404).json({
          success: false,
          error: 'No matching appointment found for that mobile number.',
        });
      }

      const { data: rpcRes, error: rpcErr } = await supabase.rpc('cancel_appointment', {
        p_appointment_id: normalizedId,
        p_actor_role: 'customer',
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
      console.error('[CELESTE appointments] POST /:id/cancel failed:', err?.message || 'Unknown error');
      return res.status(503).json({ success: false, error: 'Unable to cancel appointment right now.' });
    }
  });

  return router;
}

export default createAppointmentsRouter();
