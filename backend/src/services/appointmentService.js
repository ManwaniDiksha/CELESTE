import { getIstClock } from './queueService.js';

const ACTIVE_APPT_STATUSES = ['Booked', 'Confirmed', 'Checked In'];
const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function parseHhMmToMinutes(value) {
  if (typeof value !== 'string') return null;
  const match = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function parseTimeToMinutes(value) {
  if (typeof value !== 'string') return null;
  const match = /^([01][0-9]|2[0-3]):([0-5][0-9])(?::[0-5][0-9])?$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function minutesToHhMm(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function getWeekdayKeyForIsoDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return WEEKDAY_KEYS[dt.getUTCDay()] || null;
}

/**
 * Computes available 30-minute appointment slots for a given date and service combination.
 * Works even when the salon is currently closed (e.g. late night for tomorrow or future dates).
 */
export async function getAvailableAppointmentSlots(
  supabase,
  { date, serviceIds = [], preferredStaffId = null },
  now = new Date()
) {
  const istClock = getIstClock(now);
  if (date < istClock.date) {
    return {
      date,
      is_past: true,
      is_closed: true,
      open: null,
      close: null,
      total_duration_minutes: 0,
      total_price_inr: 0,
      slots: [],
    };
  }

  const [settingsRes, servicesRes, staffRes, qualRes, apptsRes] = await Promise.all([
    supabase.from('salon_settings').select('operating_hours').eq('id', 1).single(),
    supabase
      .from('services')
      .select('id, duration_minutes, price_inr, is_active')
      .in('id', serviceIds),
    supabase
      .from('staff')
      .select('id, slug, name_en, name_gu, display_order')
      .order('display_order', { ascending: true }),
    supabase.from('staff_services').select('staff_id, service_id'),
    supabase
      .from('appointments')
      .select('id, assigned_staff_id, start_time, end_time, status')
      .eq('appointment_date', date)
      .in('status', ACTIVE_APPT_STATUSES),
  ]);

  if (settingsRes.error || !settingsRes.data) throw new Error('SETTINGS_LOAD_FAILED');
  if (servicesRes.error) throw new Error('SERVICES_LOAD_FAILED');
  if (staffRes.error) throw new Error('STAFF_LOAD_FAILED');
  if (qualRes.error) throw new Error('STAFF_SERVICES_LOAD_FAILED');
  if (apptsRes.error) throw new Error('APPOINTMENTS_LOAD_FAILED');

  const activeServices = (servicesRes.data || []).filter((s) => s.is_active);
  if (activeServices.length !== serviceIds.length) {
    return { error: 'One or more selected services are unavailable.' };
  }

  const totalDuration = activeServices.reduce((sum, s) => sum + Number(s.duration_minutes || 0), 0);
  const totalPrice = activeServices.reduce((sum, s) => sum + Number(s.price_inr || 0), 0);

  const dayKey = getWeekdayKeyForIsoDate(date);
  const dayHours = settingsRes.data.operating_hours?.[dayKey];
  const openMin = parseHhMmToMinutes(dayHours?.open);
  const closeMin = parseHhMmToMinutes(dayHours?.close);

  if (openMin === null || closeMin === null || openMin >= closeMin) {
    return {
      date,
      is_past: false,
      is_closed: true,
      open: null,
      close: null,
      total_duration_minutes: totalDuration,
      total_price_inr: totalPrice,
      slots: [],
    };
  }

  const qualByStaff = new Map();
  for (const row of qualRes.data || []) {
    const set = qualByStaff.get(row.staff_id) || new Set();
    set.add(row.service_id);
    qualByStaff.set(row.staff_id, set);
  }

  const qualifiedStaff = (staffRes.data || []).filter((member) => {
    if (preferredStaffId && member.id !== preferredStaffId) return false;
    const set = qualByStaff.get(member.id) || new Set();
    return serviceIds.every((id) => set.has(id));
  });

  const busyIntervalsByStaff = new Map();
  for (const appt of apptsRes.data || []) {
    const startMin = parseTimeToMinutes(appt.start_time);
    const endMin = parseTimeToMinutes(appt.end_time);
    if (startMin === null || endMin === null) continue;
    const list = busyIntervalsByStaff.get(appt.assigned_staff_id) || [];
    list.push({ startMin, endMin });
    busyIntervalsByStaff.set(appt.assigned_staff_id, list);
  }

  const minStartMin =
    date === istClock.date ? istClock.minutesFromMidnight + 15 : openMin;

  const slots = [];
  for (let startMin = openMin; startMin + totalDuration <= closeMin; startMin += 30) {
    if (startMin < minStartMin) continue;
    const endMin = startMin + totalDuration;

    const availableStaffIds = qualifiedStaff
      .filter((member) => {
        const intervals = busyIntervalsByStaff.get(member.id) || [];
        return !intervals.some((iv) => iv.startMin < endMin && iv.endMin > startMin);
      })
      .map((m) => m.id);

    if (availableStaffIds.length > 0) {
      slots.push({
        start_time: minutesToHhMm(startMin),
        end_time: minutesToHhMm(endMin),
        available_staff_ids: availableStaffIds,
        available_count: availableStaffIds.length,
      });
    }
  }

  return {
    date,
    is_past: false,
    is_closed: false,
    open: dayHours.open,
    close: dayHours.close,
    total_duration_minutes: totalDuration,
    total_price_inr: totalPrice,
    slots,
  };
}

/**
 * Customer appointment lookup requiring both reference_code and 10-digit phone.
 */
export async function lookupAppointmentByReferenceAndPhone(supabase, { referenceCode, phone }) {
  const { data: customer, error: custErr } = await supabase
    .from('customers')
    .select('id, name')
    .eq('phone', phone)
    .maybeSingle();

  if (custErr) throw new Error('CUSTOMER_LOOKUP_FAILED');
  if (!customer) return null;

  const { data: appt, error: apptErr } = await supabase
    .from('appointments')
    .select('*')
    .eq('reference_code', referenceCode)
    .eq('customer_id', customer.id)
    .maybeSingle();

  if (apptErr) throw new Error('APPOINTMENT_LOOKUP_FAILED');
  if (!appt) return null;

  const [staffRes, svcRes, queueRes] = await Promise.all([
    supabase
      .from('staff')
      .select('id, slug, name_en, name_gu, role_en, role_gu, avatar_url')
      .eq('id', appt.assigned_staff_id)
      .single(),
    supabase
      .from('appointment_services')
      .select('service_id, position, service_name_en_snapshot, service_name_gu_snapshot, duration_minutes_snapshot, price_inr_snapshot')
      .eq('appointment_id', appt.id)
      .order('position', { ascending: true }),
    appt.queue_entry_id
      ? supabase
          .from('queue_entries')
          .select('id, token_display, status')
          .eq('id', appt.queue_entry_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  return {
    appointment_id: appt.id,
    reference_code: appt.reference_code,
    appointment_date: appt.appointment_date,
    start_time: String(appt.start_time).slice(0, 5),
    end_time: String(appt.end_time).slice(0, 5),
    status: appt.status,
    selection_mode: appt.selection_mode,
    customer_name: customer.name,
    assigned_staff: staffRes.data || null,
    services: svcRes.data || [],
    total_duration_minutes: appt.total_duration_minutes,
    total_price_inr: appt.total_price_inr,
    queue_entry_id: appt.queue_entry_id || null,
    queue_token_display: queueRes.data?.token_display || null,
    queue_status: queueRes.data?.status || null,
    can_cancel: appt.status === 'Booked' || appt.status === 'Confirmed',
  };
}

/**
 * Loads today's and upcoming appointments for Reception (includes customer phone)
 * or Owner (zero-PII).
 */
export async function listAppointmentsData(supabase, { includePii = false } = {}, now = new Date()) {
  const istClock = getIstClock(now);

  const { data: appts, error: apptErr } = await supabase
    .from('appointments')
    .select('*')
    .gte('appointment_date', istClock.date)
    .order('appointment_date', { ascending: true })
    .order('start_time', { ascending: true });

  if (apptErr) throw new Error(`APPOINTMENTS_LOAD_FAILED: ${apptErr.message}`);
  const rows = appts || [];
  if (rows.length === 0) {
    return {
      today_date: istClock.date,
      today_appointments: [],
      upcoming_appointments: [],
      summary: {
        today_total: 0,
        today_booked: 0,
        today_checked_in: 0,
        upcoming_total: 0,
      },
    };
  }

  const apptIds = rows.map((r) => r.id);
  const staffIds = [...new Set(rows.map((r) => r.assigned_staff_id).filter(Boolean))];
  const customerIds = includePii ? [...new Set(rows.map((r) => r.customer_id).filter(Boolean))] : [];
  const queueIds = [...new Set(rows.map((r) => r.queue_entry_id).filter(Boolean))];

  const [staffRes, svcRes, custRes, queueRes] = await Promise.all([
    staffIds.length > 0
      ? supabase.from('staff').select('id, slug, name_en, name_gu').in('id', staffIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('appointment_services')
      .select('appointment_id, service_id, position, service_name_en_snapshot, service_name_gu_snapshot, duration_minutes_snapshot, price_inr_snapshot')
      .in('appointment_id', apptIds)
      .order('position', { ascending: true }),
    includePii && customerIds.length > 0
      ? supabase.from('customers').select('id, name, phone').in('id', customerIds)
      : Promise.resolve({ data: [], error: null }),
    queueIds.length > 0
      ? supabase.from('queue_entries').select('id, token_display, status').in('id', queueIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (staffRes.error) throw new Error('STAFF_LOAD_FAILED');
  if (svcRes.error) throw new Error('APPT_SERVICES_LOAD_FAILED');
  if (custRes.error) throw new Error('CUSTOMERS_LOAD_FAILED');
  if (queueRes.error) throw new Error('QUEUE_LOAD_FAILED');

  const staffMap = new Map((staffRes.data || []).map((s) => [s.id, s]));
  const custMap = new Map((custRes.data || []).map((c) => [c.id, c]));
  const queueMap = new Map((queueRes.data || []).map((q) => [q.id, q]));
  const svcMap = new Map();
  for (const s of svcRes.data || []) {
    const list = svcMap.get(s.appointment_id) || [];
    list.push(s);
    svcMap.set(s.appointment_id, list);
  }

  const formatRow = (r) => {
    const cust = includePii ? custMap.get(r.customer_id) : null;
    const q = r.queue_entry_id ? queueMap.get(r.queue_entry_id) : null;
    return {
      appointment_id: r.id,
      reference_code: r.reference_code,
      appointment_date: r.appointment_date,
      start_time: String(r.start_time).slice(0, 5),
      end_time: String(r.end_time).slice(0, 5),
      status: r.status,
      selection_mode: r.selection_mode,
      is_demo: Boolean(r.is_demo),
      ...(includePii
        ? {
            customer_name: cust?.name || null,
            customer_phone: cust?.phone || null,
          }
        : {}),
      assigned_staff: staffMap.get(r.assigned_staff_id) || null,
      services: svcMap.get(r.id) || [],
      total_duration_minutes: r.total_duration_minutes,
      total_price_inr: r.total_price_inr,
      queue_entry_id: r.queue_entry_id || null,
      queue_token_display: q?.token_display || null,
      queue_status: q?.status || null,
      can_check_in: r.appointment_date === istClock.date && (r.status === 'Booked' || r.status === 'Confirmed') && !r.queue_entry_id,
      can_cancel: r.status === 'Booked' || r.status === 'Confirmed',
      can_mark_no_show: r.status === 'Booked' || r.status === 'Confirmed',
    };
  };

  const formatted = rows.map(formatRow);
  const todayAppointments = formatted.filter((a) => a.appointment_date === istClock.date);
  const upcomingAppointments = formatted.filter((a) => a.appointment_date > istClock.date);

  return {
    today_date: istClock.date,
    today_appointments: todayAppointments,
    upcoming_appointments: upcomingAppointments,
    summary: {
      today_total: todayAppointments.length,
      today_booked: todayAppointments.filter((a) => a.status === 'Booked' || a.status === 'Confirmed').length,
      today_checked_in: todayAppointments.filter((a) => a.status === 'Checked In').length,
      upcoming_total: upcomingAppointments.filter((a) => a.status === 'Booked' || a.status === 'Confirmed').length,
    },
  };
}
