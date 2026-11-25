import {
  buildStaffQueueSnapshot,
  ensureDailyReadConsistency,
  evaluateSalonOperatingStatus,
  getIstClock,
  mapQueueRpcError,
  summarizeEntryServices,
} from './queueService.js';

const ACTIVE_STATUSES = ['Waiting', 'Called', 'In Chair'];

function formatZeroPiiOwnerEntry(entry, staffById, servicesByEntryId) {
  const svcSummary = summarizeEntryServices(servicesByEntryId.get(entry.id) || []);
  const staff = staffById.get(entry.assigned_staff_id) || null;

  return {
    entry_id: entry.id,
    queue_date: entry.queue_date,
    token_number: entry.token_number,
    token_display: entry.token_display,
    status: entry.status,
    source: entry.source,
    selection_mode: entry.selection_mode,
    is_demo: Boolean(entry.is_demo),
    assigned_staff: staff
      ? {
          id: staff.id,
          slug: staff.slug,
          name_en: staff.name_en,
          name_gu: staff.name_gu,
        }
      : null,
    services: svcSummary.services,
    total_duration_minutes: svcSummary.totalDurationMinutes,
    total_price_inr: svcSummary.totalPriceInr,
    joined_at: entry.joined_at,
    called_at: entry.called_at,
    started_at: entry.started_at,
    completed_at: entry.completed_at,
    cancelled_at: entry.cancelled_at,
    cancelled_by: entry.cancelled_by,
    no_show_at: entry.no_show_at,
  };
}

function summarizeDayEntries(entries, statsRow, servicesByEntryId) {
  const doneEntries = entries.filter((e) => e.status === 'Done');
  const computedRevenue = doneEntries.reduce((sum, e) => {
    const svc = summarizeEntryServices(servicesByEntryId.get(e.id) || []);
    return sum + svc.totalPriceInr;
  }, 0);
  const computedCompletedServices = doneEntries.reduce((sum, e) => {
    return sum + (servicesByEntryId.get(e.id) || []).length;
  }, 0);

  return {
    total_entries: Number(statsRow?.total_entries ?? entries.length),
    waiting_count: Number(statsRow?.waiting_count ?? entries.filter((e) => e.status === 'Waiting').length),
    called_count: Number(statsRow?.called_count ?? entries.filter((e) => e.status === 'Called').length),
    in_chair_count: Number(statsRow?.in_chair_count ?? entries.filter((e) => e.status === 'In Chair').length),
    served_count: Number(statsRow?.served_count ?? doneEntries.length),
    cancelled_count: Number(statsRow?.cancelled_count ?? entries.filter((e) => e.status === 'Cancelled').length),
    no_show_count: Number(statsRow?.no_show_count ?? entries.filter((e) => e.status === 'No-show').length),
    completed_services_count: Number(statsRow?.completed_services_count ?? computedCompletedServices),
    daily_revenue_inr: Number(statsRow?.daily_revenue_inr ?? computedRevenue),
    has_recorded_data: entries.length > 0 || Boolean(statsRow),
    revenue_basis: 'completed_service_snapshots',
  };
}

/**
 * Loads full zero-PII Owner dashboard payload from live Supabase tables and
 * the daily_queue_statistics view. Never exposes customer names, phones, or secrets.
 */
export async function getOwnerDashboardData(
  supabase,
  { selectedDate = null, historyLimit = 14 } = {},
  now = new Date()
) {
  const istClock = getIstClock(now);
  const reportDate = selectedDate || istClock.date;

  const { data: initialSettings, error: settingsErr } = await supabase
    .from('salon_settings')
    .select('*')
    .eq('id', 1)
    .single();

  if (settingsErr || !initialSettings) {
    throw new Error(`SETTINGS_LOAD_FAILED: ${settingsErr?.message || 'salon_settings missing'}`);
  }

  const { ranCleanup, ranStaffInit } = await ensureDailyReadConsistency(
    supabase,
    initialSettings,
    null,
    now
  );

  const settingsPromise =
    ranCleanup || ranStaffInit
      ? supabase.from('salon_settings').select('*').eq('id', 1).single()
      : Promise.resolve({ data: initialSettings, error: null });

  const servicesPromise = supabase
    .from('services')
    .select('id, service_key, category, name_en, name_gu, duration_minutes, price_inr, is_active, display_order')
    .order('display_order', { ascending: true })
    .order('name_en', { ascending: true });

  const staffPromise = supabase
    .from('staff')
    .select(
      'id, slug, name_en, name_gu, role_en, role_gu, speciality_en, speciality_gu, avatar_url, is_on_duty, availability_status, available_since, display_order'
    )
    .order('display_order', { ascending: true });

  const qualPromise = supabase.from('staff_services').select('staff_id, service_id');

  const todayEntriesPromise = supabase
    .from('queue_entries')
    .select(
      'id, queue_date, token_number, token_display, source, selection_mode, assigned_staff_id, status, joined_at, called_at, started_at, completed_at, cancelled_at, cancelled_by, no_show_at, is_demo'
    )
    .eq('queue_date', istClock.date)
    .order('token_number', { ascending: true });

  const selectedEntriesPromise =
    reportDate === istClock.date
      ? todayEntriesPromise
      : supabase
          .from('queue_entries')
          .select(
            'id, queue_date, token_number, token_display, source, selection_mode, assigned_staff_id, status, joined_at, called_at, started_at, completed_at, cancelled_at, cancelled_by, no_show_at, is_demo'
          )
          .eq('queue_date', reportDate)
          .order('token_number', { ascending: true });

  const historyStatsPromise = supabase
    .from('daily_queue_statistics')
    .select('*')
    .order('queue_date', { ascending: false })
    .limit(historyLimit);

  const [
    settingsRes,
    servicesRes,
    staffRes,
    qualRes,
    todayEntriesRes,
    selectedEntriesRes,
    historyStatsRes,
  ] = await Promise.all([
    settingsPromise,
    servicesPromise,
    staffPromise,
    qualPromise,
    todayEntriesPromise,
    selectedEntriesPromise,
    historyStatsPromise,
  ]);

  if (settingsRes.error || !settingsRes.data) throw new Error('SETTINGS_RELOAD_FAILED');
  if (servicesRes.error) throw new Error(`SERVICES_LOAD_FAILED: ${servicesRes.error.message}`);
  if (staffRes.error) throw new Error(`STAFF_LOAD_FAILED: ${staffRes.error.message}`);
  if (qualRes.error) throw new Error(`STAFF_SERVICES_LOAD_FAILED: ${qualRes.error.message}`);
  if (todayEntriesRes.error) throw new Error(`TODAY_ENTRIES_FAILED: ${todayEntriesRes.error.message}`);
  if (selectedEntriesRes.error) throw new Error(`REPORT_ENTRIES_FAILED: ${selectedEntriesRes.error.message}`);
  if (historyStatsRes.error) throw new Error(`HISTORY_STATS_FAILED: ${historyStatsRes.error.message}`);

  const settings = settingsRes.data;
  const services = servicesRes.data || [];
  const staffList = staffRes.data || [];
  const qualifications = qualRes.data || [];
  const todayEntries = todayEntriesRes.data || [];
  const selectedEntries = selectedEntriesRes.data || [];
  const historyRows = historyStatsRes.data || [];

  const relevantEntryIds = [...new Set([...todayEntries, ...selectedEntries].map((e) => e.id))];
  const qesRes =
    relevantEntryIds.length > 0
      ? await supabase
          .from('queue_entry_services')
          .select(
            'queue_entry_id, service_id, position, service_name_en_snapshot, service_name_gu_snapshot, duration_minutes_snapshot, price_inr_snapshot'
          )
          .in('queue_entry_id', relevantEntryIds)
          .order('position', { ascending: true })
      : { data: [], error: null };

  if (qesRes.error) throw new Error(`QUEUE_ENTRY_SERVICES_FAILED: ${qesRes.error.message}`);

  const servicesByEntryId = new Map();
  for (const row of qesRes.data || []) {
    const list = servicesByEntryId.get(row.queue_entry_id) || [];
    list.push(row);
    servicesByEntryId.set(row.queue_entry_id, list);
  }

  const staffByService = new Map();
  const servicesByStaff = new Map();
  for (const row of qualifications) {
    const stList = staffByService.get(row.service_id) || [];
    stList.push(row.staff_id);
    staffByService.set(row.service_id, stList);

    const svcList = servicesByStaff.get(row.staff_id) || [];
    svcList.push(row.service_id);
    servicesByStaff.set(row.staff_id, svcList);
  }

  const onlineEntriesTodayCount = todayEntries.filter(
    (e) => e.source === 'online' && e.status !== 'Cancelled'
  ).length;
  const operating = evaluateSalonOperatingStatus(settings, onlineEntriesTodayCount, now);

  const todayActiveEntries = todayEntries.filter((e) => ACTIVE_STATUSES.includes(e.status));
  const staffSnapshot = buildStaffQueueSnapshot(
    staffList,
    todayActiveEntries,
    servicesByEntryId,
    now
  );

  const todayStatsRow = historyRows.find((r) => r.queue_date === istClock.date) || null;
  const selectedStatsRow =
    reportDate === istClock.date
      ? todayStatsRow
      : historyRows.find((r) => r.queue_date === reportDate) ||
        (
          await supabase
            .from('daily_queue_statistics')
            .select('*')
            .eq('queue_date', reportDate)
            .maybeSingle()
        )?.data ||
        null;

  const todaySummary = summarizeDayEntries(todayEntries, todayStatsRow, servicesByEntryId);
  const selectedDaySummary = summarizeDayEntries(
    selectedEntries,
    selectedStatsRow,
    servicesByEntryId
  );

  const staffById = new Map(staffList.map((s) => [s.id, s]));

  const formattedStaff = staffList.map((member) => {
    const bucket = staffSnapshot.get(member.id);
    return {
      ...member,
      qualified_service_ids: servicesByStaff.get(member.id) || [],
      waiting_count: bucket ? bucket.waitingEntries.length : 0,
      has_active_entry: Boolean(bucket?.inChairEntry || (bucket?.calledEntries?.length || 0) > 0),
    };
  });

  const formattedServices = services.map((svc) => ({
    ...svc,
    qualified_staff_ids: staffByService.get(svc.id) || [],
  }));

  const dailyHistory = historyRows.map((row) => ({
    queue_date: row.queue_date,
    total_entries: Number(row.total_entries ?? 0),
    waiting_count: Number(row.waiting_count ?? 0),
    called_count: Number(row.called_count ?? 0),
    in_chair_count: Number(row.in_chair_count ?? 0),
    served_count: Number(row.served_count ?? 0),
    cancelled_count: Number(row.cancelled_count ?? 0),
    no_show_count: Number(row.no_show_count ?? 0),
    completed_services_count: Number(row.completed_services_count ?? 0),
    daily_revenue_inr: Number(row.daily_revenue_inr ?? 0),
    revenue_basis: 'completed_service_snapshots',
  }));

  return {
    salon: {
      name: settings.salon_name,
      timezone: settings.timezone,
      operating_hours: settings.operating_hours,
      max_services_per_entry: settings.max_services_per_entry,
      no_show_window_minutes: settings.no_show_window_minutes,
      ...operating,
    },
    overview: {
      ...todaySummary,
      active_services_count: formattedServices.filter((s) => s.is_active).length,
      total_services_count: formattedServices.length,
      on_duty_staff_count: formattedStaff.filter((s) => s.is_on_duty).length,
      total_staff_count: formattedStaff.length,
      today_demo_entries_count: todayEntries.filter((e) => Boolean(e.is_demo)).length,
    },
    services: formattedServices,
    staff: formattedStaff,
    qualifications,
    reports: {
      selected_date: reportDate,
      selected_day_summary: selectedDaySummary,
      selected_day_entries: selectedEntries.map((entry) =>
        formatZeroPiiOwnerEntry(entry, staffById, servicesByEntryId)
      ),
      daily_history: dailyHistory,
    },
  };
}

/**
 * Loads focused daily + historical zero-PII reporting data for GET /api/owner/reports.
 */
export async function getOwnerReportsData(
  supabase,
  { selectedDate = null, historyLimit = 30 } = {},
  now = new Date()
) {
  const full = await getOwnerDashboardData(supabase, { selectedDate, historyLimit }, now);
  return full.reports;
}

export async function runOwnerRpc(supabase, fnName, params) {
  const { data: rpcRes, error: rpcErr } = await supabase.rpc(fnName, params);
  if (rpcErr || !rpcRes?.success) {
    if (rpcErr) {
      return { ok: false, error: mapQueueRpcError(rpcErr) };
    }
    return {
      ok: false,
      error: {
        status: 503,
        code: 'OWNER_RPC_FAILED',
        message: 'Owner operation returned an unexpected response.',
      },
    };
  }
  return { ok: true, result: rpcRes };
}
