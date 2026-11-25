import { Router } from 'express';
import { isSupabaseConfigured } from '../config/env.js';
import { getSupabaseClient } from '../config/supabase.js';
import { requireOwnerAuth } from '../middleware/auth.js';
import { listAppointmentsData } from '../services/appointmentService.js';
import {
  getOwnerDashboardData,
  getOwnerReportsData,
  runOwnerRpc,
} from '../services/ownerService.js';
import { getIstClock } from '../services/queueService.js';
import { broadcastQueueChanged } from '../services/realtime.js';
import {
  isValidIsoDate,
  isValidUuid,
  validateDemoResetConfirmation,
  validateOwnerQualificationsBody,
  validateOwnerServiceBody,
  validateOwnerSettingsBody,
  validateOwnerStaffDutyBody,
  validateOwnerStaffProfileBody,
  validateOwnerToggleQualificationBody,
  validateStaffAvailabilityBody,
} from '../utils/validation.js';

export function createOwnerRouter({
  getSupabase = getSupabaseClient,
  isConfigured = isSupabaseConfigured,
  broadcast = broadcastQueueChanged,
  requireAuth = requireOwnerAuth,
} = {}) {
  const router = Router();
  router.use(requireAuth);

  router.get('/dashboard', async (req, res) => {
    const rawDate = typeof req.query?.date === 'string' ? req.query.date.trim() : null;
    if (rawDate && !isValidIsoDate(rawDate)) {
      return res.status(400).json({ success: false, error: 'date must be a valid YYYY-MM-DD date.' });
    }
    if (!isConfigured()) {
      return res.status(503).json({ success: false, error: 'Database service is not configured.' });
    }

    try {
      const data = await getOwnerDashboardData(getSupabase(), { selectedDate: rawDate });
      return res.status(200).json({ success: true, data });
    } catch (err) {
      console.error('[CELESTE owner] GET /dashboard failed:', err?.message || 'Unknown error');
      return res.status(503).json({ success: false, error: 'Unable to load owner dashboard right now.' });
    }
  });

  router.get('/reports', async (req, res) => {
    const rawDate = typeof req.query?.date === 'string' ? req.query.date.trim() : null;
    if (rawDate && !isValidIsoDate(rawDate)) {
      return res.status(400).json({ success: false, error: 'date must be a valid YYYY-MM-DD date.' });
    }
    const rawLimit = req.query?.limit !== undefined ? Number(req.query.limit) : 30;
    if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 90) {
      return res.status(400).json({ success: false, error: 'limit must be an integer between 1 and 90.' });
    }
    if (!isConfigured()) {
      return res.status(503).json({ success: false, error: 'Database service is not configured.' });
    }

    try {
      const data = await getOwnerReportsData(getSupabase(), {
        selectedDate: rawDate,
        historyLimit: rawLimit,
      });
      return res.status(200).json({ success: true, data });
    } catch (err) {
      console.error('[CELESTE owner] GET /reports failed:', err?.message || 'Unknown error');
      return res.status(503).json({ success: false, error: 'Unable to load owner reports right now.' });
    }
  });

  router.post('/services', async (req, res) => {
    const parsed = validateOwnerServiceBody(req.body, { partial: false });
    if (!parsed.ok) {
      return res.status(400).json({ success: false, error: parsed.error });
    }
    if (!isConfigured()) {
      return res.status(503).json({ success: false, error: 'Database service is not configured.' });
    }

    const v = parsed.value;
    const supabase = getSupabase();

    try {
      const outcome = await runOwnerRpc(supabase, 'owner_create_service', {
        p_category: v.category,
        p_name_en: v.name_en,
        p_name_gu: v.name_gu,
        p_duration_minutes: v.duration_minutes,
        p_price_inr: v.price_inr,
        p_is_active: v.is_active,
        p_staff_ids: v.staff_ids,
        p_service_key: v.service_key || null,
      });

      if (!outcome.ok) {
        return res.status(outcome.error.status).json({
          success: false,
          code: outcome.error.code,
          error: outcome.error.message,
        });
      }

      await broadcast(
        {
          queue_date: getIstClock().date,
          staff_id: null,
          action: 'service_catalog_updated',
        },
        { supabaseClient: supabase }
      );

      return res.status(201).json({
        success: true,
        data: outcome.result.data,
        message: outcome.result.message || 'Service created.',
      });
    } catch (err) {
      console.error('[CELESTE owner] POST /services failed:', err?.message || 'Unknown error');
      return res.status(503).json({ success: false, error: 'Unable to create service right now.' });
    }
  });

  router.patch('/services/:id', async (req, res) => {
    const serviceId = req.params?.id;
    if (!isValidUuid(serviceId)) {
      return res.status(400).json({ success: false, error: 'Invalid service identifier.' });
    }
    const parsed = validateOwnerServiceBody(req.body, { partial: true });
    if (!parsed.ok) {
      return res.status(400).json({ success: false, error: parsed.error });
    }
    if (!isConfigured()) {
      return res.status(503).json({ success: false, error: 'Database service is not configured.' });
    }

    const v = parsed.value;
    const supabase = getSupabase();

    try {
      const outcome = await runOwnerRpc(supabase, 'owner_update_service', {
        p_service_id: serviceId.trim().toLowerCase(),
        p_category: v.category ?? null,
        p_name_en: v.name_en ?? null,
        p_name_gu: v.name_gu ?? null,
        p_duration_minutes: v.duration_minutes ?? null,
        p_price_inr: v.price_inr ?? null,
        p_is_active: v.is_active ?? null,
        p_staff_ids: v.staff_ids === undefined ? null : v.staff_ids,
      });

      if (!outcome.ok) {
        return res.status(outcome.error.status).json({
          success: false,
          code: outcome.error.code,
          error: outcome.error.message,
        });
      }

      await broadcast(
        {
          queue_date: getIstClock().date,
          staff_id: null,
          action: 'service_catalog_updated',
        },
        { supabaseClient: supabase }
      );

      return res.status(200).json({
        success: true,
        data: outcome.result.data,
        message: outcome.result.message || 'Service updated.',
      });
    } catch (err) {
      console.error('[CELESTE owner] PATCH /services/:id failed:', err?.message || 'Unknown error');
      return res.status(503).json({ success: false, error: 'Unable to update service right now.' });
    }
  });

  router.patch('/staff/:id/profile', async (req, res) => {
    const staffId = req.params?.id;
    if (!isValidUuid(staffId)) {
      return res.status(400).json({ success: false, error: 'Invalid staff identifier.' });
    }
    const parsed = validateOwnerStaffProfileBody(req.body);
    if (!parsed.ok) {
      return res.status(400).json({ success: false, error: parsed.error });
    }
    if (!isConfigured()) {
      return res.status(503).json({ success: false, error: 'Database service is not configured.' });
    }

    const normalizedStaffId = staffId.trim().toLowerCase();
    const v = parsed.value;
    const supabase = getSupabase();

    try {
      const outcome = await runOwnerRpc(supabase, 'owner_update_staff_profile', {
        p_staff_id: normalizedStaffId,
        p_slug: v.slug ?? null,
        p_name_en: v.name_en ?? null,
        p_name_gu: v.name_gu ?? null,
        p_role_en: v.role_en ?? null,
        p_role_gu: v.role_gu ?? null,
        p_speciality_en: v.speciality_en ?? null,
        p_speciality_gu: v.speciality_gu ?? null,
      });

      if (!outcome.ok) {
        return res.status(outcome.error.status).json({
          success: false,
          code: outcome.error.code,
          error: outcome.error.message,
        });
      }

      await broadcast(
        {
          queue_date: getIstClock().date,
          staff_id: normalizedStaffId,
          action: 'staff_profile_updated',
        },
        { supabaseClient: supabase }
      );

      return res.status(200).json({
        success: true,
        data: outcome.result.data,
        message: outcome.result.message || 'Staff profile updated.',
      });
    } catch (err) {
      console.error('[CELESTE owner] PATCH /staff/:id/profile failed:', err?.message || 'Unknown error');
      return res.status(503).json({ success: false, error: 'Unable to update staff profile right now.' });
    }
  });

  router.patch('/staff/:id/duty', async (req, res) => {
    const staffId = req.params?.id;
    if (!isValidUuid(staffId)) {
      return res.status(400).json({ success: false, error: 'Invalid staff identifier.' });
    }
    const parsed = validateOwnerStaffDutyBody(req.body);
    if (!parsed.ok) {
      return res.status(400).json({ success: false, error: parsed.error });
    }
    if (!isConfigured()) {
      return res.status(503).json({ success: false, error: 'Database service is not configured.' });
    }

    const normalizedStaffId = staffId.trim().toLowerCase();
    const supabase = getSupabase();

    try {
      const outcome = await runOwnerRpc(supabase, 'set_staff_duty', {
        p_staff_id: normalizedStaffId,
        p_is_on_duty: parsed.value.is_on_duty,
      });

      if (!outcome.ok) {
        return res.status(outcome.error.status).json({
          success: false,
          code: outcome.error.code,
          error: outcome.error.message,
        });
      }

      await broadcast(
        {
          queue_date: getIstClock().date,
          staff_id: normalizedStaffId,
          action: 'staff_duty_updated',
        },
        { supabaseClient: supabase }
      );

      return res.status(200).json({
        success: true,
        data: outcome.result.data,
        message: outcome.result.message || 'Staff duty status updated.',
      });
    } catch (err) {
      console.error('[CELESTE owner] PATCH /staff/:id/duty failed:', err?.message || 'Unknown error');
      return res.status(503).json({ success: false, error: 'Unable to update staff duty status right now.' });
    }
  });

  router.patch('/staff/:id/availability', async (req, res) => {
    const staffId = req.params?.id;
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
      const outcome = await runOwnerRpc(supabase, 'set_staff_availability', {
        p_staff_id: normalizedStaffId,
        p_status: parsed.value.status,
        p_actor_role: 'owner',
      });

      if (!outcome.ok) {
        return res.status(outcome.error.status).json({
          success: false,
          code: outcome.error.code,
          error: outcome.error.message,
        });
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
        data: outcome.result.data,
        message: outcome.result.message || 'Staff availability updated.',
      });
    } catch (err) {
      console.error('[CELESTE owner] PATCH /staff/:id/availability failed:', err?.message || 'Unknown error');
      return res.status(503).json({ success: false, error: 'Unable to update staff availability right now.' });
    }
  });

  router.put('/staff/:id/qualifications', async (req, res) => {
    const staffId = req.params?.id;
    if (!isValidUuid(staffId)) {
      return res.status(400).json({ success: false, error: 'Invalid staff identifier.' });
    }
    const parsed = validateOwnerQualificationsBody(req.body);
    if (!parsed.ok) {
      return res.status(400).json({ success: false, error: parsed.error });
    }
    if (!isConfigured()) {
      return res.status(503).json({ success: false, error: 'Database service is not configured.' });
    }

    const normalizedStaffId = staffId.trim().toLowerCase();
    const supabase = getSupabase();

    try {
      const outcome = await runOwnerRpc(supabase, 'owner_set_staff_qualifications', {
        p_staff_id: normalizedStaffId,
        p_service_ids: parsed.value.service_ids,
      });

      if (!outcome.ok) {
        return res.status(outcome.error.status).json({
          success: false,
          code: outcome.error.code,
          error: outcome.error.message,
        });
      }

      await broadcast(
        {
          queue_date: getIstClock().date,
          staff_id: normalizedStaffId,
          action: 'staff_qualifications_updated',
        },
        { supabaseClient: supabase }
      );

      return res.status(200).json({
        success: true,
        data: outcome.result.data,
        message: outcome.result.message || 'Staff qualifications updated.',
      });
    } catch (err) {
      console.error('[CELESTE owner] PUT /staff/:id/qualifications failed:', err?.message || 'Unknown error');
      return res.status(503).json({ success: false, error: 'Unable to update staff qualifications right now.' });
    }
  });

  router.post('/qualifications/toggle', async (req, res) => {
    const parsed = validateOwnerToggleQualificationBody(req.body);
    if (!parsed.ok) {
      return res.status(400).json({ success: false, error: parsed.error });
    }
    if (!isConfigured()) {
      return res.status(503).json({ success: false, error: 'Database service is not configured.' });
    }

    const { staff_id, service_id, qualified } = parsed.value;
    const supabase = getSupabase();

    try {
      const outcome = await runOwnerRpc(supabase, 'owner_toggle_qualification', {
        p_staff_id: staff_id,
        p_service_id: service_id,
        p_qualified: qualified,
      });

      if (!outcome.ok) {
        return res.status(outcome.error.status).json({
          success: false,
          code: outcome.error.code,
          error: outcome.error.message,
        });
      }

      await broadcast(
        {
          queue_date: getIstClock().date,
          staff_id,
          action: 'staff_qualifications_updated',
        },
        { supabaseClient: supabase }
      );

      return res.status(200).json({
        success: true,
        data: outcome.result.data,
        message: outcome.result.message || 'Qualification updated.',
      });
    } catch (err) {
      console.error('[CELESTE owner] POST /qualifications/toggle failed:', err?.message || 'Unknown error');
      return res.status(503).json({ success: false, error: 'Unable to update qualification right now.' });
    }
  });

  router.patch('/settings', async (req, res) => {
    const parsed = validateOwnerSettingsBody(req.body);
    if (!parsed.ok) {
      return res.status(400).json({ success: false, error: parsed.error });
    }
    if (!isConfigured()) {
      return res.status(503).json({ success: false, error: 'Database service is not configured.' });
    }

    const v = parsed.value;
    const supabase = getSupabase();

    try {
      const outcome = await runOwnerRpc(supabase, 'owner_update_salon_settings', {
        p_operating_hours: v.operating_hours ?? null,
        p_is_online_queue_open: v.is_online_queue_open ?? null,
        p_daily_online_capacity: v.daily_online_capacity ?? null,
        p_online_cutoff_minutes: v.online_cutoff_minutes ?? null,
      });

      if (!outcome.ok) {
        return res.status(outcome.error.status).json({
          success: false,
          code: outcome.error.code,
          error: outcome.error.message,
        });
      }

      await broadcast(
        {
          queue_date: getIstClock().date,
          staff_id: null,
          action: 'salon_settings_updated',
        },
        { supabaseClient: supabase }
      );

      return res.status(200).json({
        success: true,
        data: outcome.result.data,
        message: outcome.result.message || 'Salon settings updated.',
      });
    } catch (err) {
      console.error('[CELESTE owner] PATCH /settings failed:', err?.message || 'Unknown error');
      return res.status(503).json({ success: false, error: 'Unable to update salon settings right now.' });
    }
  });

  router.post('/demo-reset', async (req, res) => {
    const parsed = validateDemoResetConfirmation(req.body);
    if (!parsed.ok) {
      return res.status(400).json({ success: false, error: parsed.error });
    }
    if (!isConfigured()) {
      return res.status(503).json({ success: false, error: 'Database service is not configured.' });
    }

    const supabase = getSupabase();

    try {
      const outcome = await runOwnerRpc(supabase, 'reset_demo_data', {});
      if (!outcome.ok) {
        return res.status(outcome.error.status).json({
          success: false,
          code: outcome.error.code,
          error: outcome.error.message,
        });
      }

      await broadcast(
        {
          queue_date: outcome.result.data?.reset_date || getIstClock().date,
          staff_id: null,
          action: 'demo_data_reset',
        },
        { supabaseClient: supabase }
      );

      return res.status(200).json({
        success: true,
        data: outcome.result.data,
        message: outcome.result.message || 'Demo queue data reset.',
      });
    } catch (err) {
      console.error('[CELESTE owner] POST /demo-reset failed:', err?.message || 'Unknown error');
      return res.status(503).json({ success: false, error: 'Unable to reset demo data right now.' });
    }
  });

  router.get('/appointments', async (_req, res) => {
    if (!isConfigured()) {
      return res.status(503).json({ success: false, error: 'Database service is not configured.' });
    }
    try {
      const data = await listAppointmentsData(getSupabase(), { includePii: false });
      return res.status(200).json({ success: true, data });
    } catch (err) {
      console.error('[CELESTE owner] GET /appointments failed:', err?.message || 'Unknown error');
      return res.status(503).json({ success: false, error: 'Unable to load appointments right now.' });
    }
  });

  router.post('/appointments/:id/cancel', async (req, res) => {
    const apptId = req.params?.id;
    if (!isValidUuid(apptId)) {
      return res.status(400).json({ success: false, error: 'Invalid appointment identifier.' });
    }
    const confirmation = validateDemoResetConfirmation(req.body).ok
      ? { ok: true }
      : req.body?.confirmed === true
        ? { ok: true }
        : { ok: false, error: 'Explicit confirmation (confirmed: true) is required.' };
    if (!confirmation.ok) {
      return res.status(400).json({ success: false, error: confirmation.error });
    }
    if (!isConfigured()) {
      return res.status(503).json({ success: false, error: 'Database service is not configured.' });
    }

    const supabase = getSupabase();
    try {
      const outcome = await runOwnerRpc(supabase, 'cancel_appointment', {
        p_appointment_id: apptId.trim().toLowerCase(),
        p_actor_role: 'owner',
      });
      if (!outcome.ok) {
        return res.status(outcome.error.status).json({
          success: false,
          code: outcome.error.code,
          error: outcome.error.message,
        });
      }

      await broadcast(
        {
          queue_date: outcome.result.data?.appointment_date || getIstClock().date,
          staff_id: outcome.result.data?.assigned_staff_id || null,
          action: 'appointment_cancelled',
        },
        { supabaseClient: supabase }
      );

      return res.status(200).json({
        success: true,
        data: outcome.result.data,
        message: outcome.result.message || 'Appointment cancelled.',
      });
    } catch (err) {
      console.error('[CELESTE owner] POST /appointments/:id/cancel failed:', err?.message || 'Unknown error');
      return res.status(503).json({ success: false, error: 'Unable to cancel appointment right now.' });
    }
  });

  return router;
}

export default createOwnerRouter();
