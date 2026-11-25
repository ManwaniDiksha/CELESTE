const SALON_TIMEZONE = 'Asia/Kolkata';
const HH_MM_REGEX = /^([01][0-9]|2[0-3]):([0-5][0-9])$/;
const ACTIVE_STATUSES = ['Waiting', 'Called', 'In Chair'];
const TERMINAL_STATUSES = new Set(['Done', 'Cancelled', 'No-show']);

const WEEKDAY_TO_KEY = Object.freeze({
  Mon: 'mon',
  Tue: 'tue',
  Wed: 'wed',
  Thu: 'thu',
  Fri: 'fri',
  Sat: 'sat',
  Sun: 'sun',
});

const IST_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: SALON_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function parseHhMmToMinutes(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const match = HH_MM_REGEX.exec(value.trim());
  if (!match) {
    return null;
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function parseTimestampMs(value) {
  if (!value) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Computes current date (YYYY-MM-DD), day key (mon..sun), and clock in Asia/Kolkata.
 */
export function getIstClock(now = new Date()) {
  const dateObj = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(dateObj.getTime())) {
    throw new Error('Invalid date provided to getIstClock.');
  }

  const parts = {};
  for (const part of IST_FORMATTER.formatToParts(dateObj)) {
    if (part.type !== 'literal') {
      parts[part.type] = part.value;
    }
  }

  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const second = Number(parts.second);

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    dayKey: WEEKDAY_TO_KEY[parts.weekday] || null,
    timeHhMm: `${parts.hour}:${parts.minute}`,
    minutesFromMidnight: hour * 60 + minute,
    nowMs: dateObj.getTime(),
  };
}

/**
 * Evaluates salon open/closed status and online queue registration eligibility
 * against salon_settings.operating_hours and online limits in Asia/Kolkata.
 */
export function evaluateSalonOperatingStatus(settings, onlineEntriesTodayCount = 0, now = new Date()) {
  const istClock = getIstClock(now);
  const dayHours =
    settings?.operating_hours && typeof settings.operating_hours === 'object'
      ? settings.operating_hours[istClock.dayKey]
      : null;

  const openStr = typeof dayHours?.open === 'string' ? dayHours.open.trim() : null;
  const closeStr = typeof dayHours?.close === 'string' ? dayHours.close.trim() : null;
  const openMinutes = parseHhMmToMinutes(openStr);
  const closeMinutes = parseHhMmToMinutes(closeStr);

  const hasValidDaySchedule =
    openMinutes !== null && closeMinutes !== null && openMinutes < closeMinutes;

  // Opening time inclusive, closing time exclusive (matches is_business_day_closed & join_queue).
  const isSalonOpen =
    hasValidDaySchedule &&
    istClock.minutesFromMidnight >= openMinutes &&
    istClock.minutesFromMidnight < closeMinutes;

  const isPastClosingTime =
    !hasValidDaySchedule || istClock.minutesFromMidnight >= closeMinutes;

  const cutoffMinutesConfig = Number.isInteger(settings?.online_cutoff_minutes)
    ? settings.online_cutoff_minutes
    : 30;
  const onlineCutoffMinutes = hasValidDaySchedule ? closeMinutes - cutoffMinutesConfig : null;
  const isBeforeOnlineCutoff =
    isSalonOpen &&
    onlineCutoffMinutes !== null &&
    istClock.minutesFromMidnight < onlineCutoffMinutes;

  const dailyOnlineCapacity = Number.isInteger(settings?.daily_online_capacity)
    ? settings.daily_online_capacity
    : 0;
  const remainingOnlineSlots = Math.max(0, dailyOnlineCapacity - onlineEntriesTodayCount);

  let onlineBlockedReason = null;
  if (!isSalonOpen) {
    onlineBlockedReason = 'SALON_CLOSED';
  } else if (!settings?.is_online_queue_open) {
    onlineBlockedReason = 'ONLINE_QUEUE_CLOSED';
  } else if (!isBeforeOnlineCutoff) {
    onlineBlockedReason = 'ONLINE_CUTOFF_PASSED';
  } else if (onlineEntriesTodayCount >= dailyOnlineCapacity) {
    onlineBlockedReason = 'ONLINE_CAPACITY_FULL';
  }

  return {
    queue_date: istClock.date,
    timezone: settings?.timezone || SALON_TIMEZONE,
    current_time_ist: istClock.timeHhMm,
    day_key: istClock.dayKey,
    today_open: hasValidDaySchedule ? openStr : null,
    today_close: hasValidDaySchedule ? closeStr : null,
    is_salon_open: isSalonOpen,
    is_past_closing_time: isPastClosingTime,
    is_online_queue_open: Boolean(settings?.is_online_queue_open),
    is_before_online_cutoff: isBeforeOnlineCutoff,
    online_cutoff_minutes: cutoffMinutesConfig,
    daily_online_capacity: dailyOnlineCapacity,
    online_entries_today: onlineEntriesTodayCount,
    remaining_online_slots: remainingOnlineSlots,
    can_join_online: onlineBlockedReason === null,
    online_blocked_reason: onlineBlockedReason,
  };
}

/**
 * Compares two queue entries strictly in FCFS order: joined_at ASC, token_number ASC.
 */
export function compareEntriesFcfs(a, b) {
  const aTime = parseTimestampMs(a?.joined_at) ?? 0;
  const bTime = parseTimestampMs(b?.joined_at) ?? 0;
  if (aTime !== bTime) {
    return aTime - bTime;
  }
  return (a?.token_number ?? 0) - (b?.token_number ?? 0);
}

/**
 * Computes summed duration and price from queue_entry_services snapshots.
 */
export function summarizeEntryServices(serviceRows = []) {
  const ordered = [...serviceRows].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  let totalDurationMinutes = 0;
  let totalPriceInr = 0;

  for (const row of ordered) {
    totalDurationMinutes += Number(row.duration_minutes_snapshot) || 0;
    totalPriceInr += Number(row.price_inr_snapshot) || 0;
  }

  return {
    services: ordered,
    totalDurationMinutes,
    totalPriceInr,
  };
}

/**
 * Computes elapsed & remaining timing for an active In Chair entry.
 * Returns null timing values when started_at or duration is missing/invalid.
 */
export function computeActiveServiceTiming(entry, totalDurationMinutes, now = new Date()) {
  if (!entry || entry.status !== 'In Chair') {
    return {
      elapsed_seconds: null,
      elapsed_minutes: null,
      remaining_seconds: null,
      remaining_minutes: null,
      remaining_minutes_exact: null,
    };
  }

  const startedAtMs = parseTimestampMs(entry.started_at);
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();

  if (
    startedAtMs === null ||
    !Number.isFinite(nowMs) ||
    !Number.isFinite(totalDurationMinutes) ||
    totalDurationMinutes <= 0
  ) {
    return {
      elapsed_seconds: null,
      elapsed_minutes: null,
      remaining_seconds: null,
      remaining_minutes: null,
      remaining_minutes_exact: null,
    };
  }

  const elapsedMs = Math.max(0, nowMs - startedAtMs);
  const totalSeconds = totalDurationMinutes * 60;
  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);
  const remainingMinutesExact = Math.max(0, totalDurationMinutes - elapsedMs / 60000);

  return {
    elapsed_seconds: elapsedSeconds,
    elapsed_minutes: Math.floor(elapsedSeconds / 60),
    remaining_seconds: remainingSeconds,
    remaining_minutes: Math.ceil(remainingMinutesExact),
    remaining_minutes_exact: remainingMinutesExact,
  };
}

/**
 * Groups active entries by assigned_staff_id and precomputes FCFS waiting queues,
 * current Called/In Chair entries, and projected workload in minutes.
 * Terminal entries are always excluded.
 */
export function buildStaffQueueSnapshot(staffList, activeEntries, entryServicesByEntryId, now = new Date()) {
  const nonTerminalEntries = (activeEntries || []).filter(
    (entry) => entry && !TERMINAL_STATUSES.has(entry.status) && ACTIVE_STATUSES.includes(entry.status)
  );

  const byStaff = new Map();
  for (const member of staffList || []) {
    byStaff.set(member.id, {
      staff: member,
      inChairEntry: null,
      calledEntries: [],
      waitingEntries: [],
      workloadMinutesExact: 0,
      hasUnknownTiming: false,
    });
  }

  for (const entry of nonTerminalEntries) {
    const bucket = byStaff.get(entry.assigned_staff_id);
    if (!bucket) {
      continue;
    }

    const summary = summarizeEntryServices(entryServicesByEntryId.get(entry.id) || []);
    const enriched = {
      ...entry,
      total_duration_minutes: summary.totalDurationMinutes,
      total_price_inr: summary.totalPriceInr,
      service_snapshots: summary.services,
    };

    if (entry.status === 'In Chair') {
      const timing = computeActiveServiceTiming(entry, summary.totalDurationMinutes, now);
      enriched.timing = timing;
      bucket.inChairEntry = enriched;
      if (timing.remaining_minutes_exact === null) {
        bucket.hasUnknownTiming = true;
      } else {
        bucket.workloadMinutesExact += timing.remaining_minutes_exact;
      }
    } else if (entry.status === 'Called') {
      bucket.calledEntries.push(enriched);
      bucket.workloadMinutesExact += summary.totalDurationMinutes;
    } else if (entry.status === 'Waiting') {
      bucket.waitingEntries.push(enriched);
      bucket.workloadMinutesExact += summary.totalDurationMinutes;
    }
  }

  for (const bucket of byStaff.values()) {
    bucket.calledEntries.sort(compareEntriesFcfs);
    bucket.waitingEntries.sort(compareEntriesFcfs);
  }

  return byStaff;
}

/**
 * Computes per-entry queue position, customers ahead, estimated wait, and
 * Any Available Stylist preview ETA.
 */
export function computeAnyAvailablePreview(staffSnapshotMap, qualifiedStaffIds, now = new Date()) {
  const qualifiedSet = new Set(qualifiedStaffIds || []);
  const eligibleCandidates = [];

  for (const bucket of staffSnapshotMap.values()) {
    const { staff } = bucket;
    if (!qualifiedSet.has(staff.id)) {
      continue;
    }
    if (!staff.is_on_duty || staff.availability_status === 'On Break') {
      continue;
    }
    eligibleCandidates.push(bucket);
  }

  if (eligibleCandidates.length === 0) {
    return {
      has_eligible_staff: false,
      projected_staff_id: null,
      estimated_wait_minutes: null,
    };
  }

  eligibleCandidates.sort((a, b) => {
    if (a.workloadMinutesExact !== b.workloadMinutesExact) {
      return a.workloadMinutesExact - b.workloadMinutesExact;
    }
    const aAvail = parseTimestampMs(a.staff.available_since) ?? 0;
    const bAvail = parseTimestampMs(b.staff.available_since) ?? 0;
    if (aAvail !== bAvail) {
      return aAvail - bAvail;
    }
    return String(a.staff.id).localeCompare(String(b.staff.id));
  });

  const best = eligibleCandidates[0];
  return {
    has_eligible_staff: true,
    projected_staff_id: best.staff.id,
    estimated_wait_minutes: best.hasUnknownTiming ? null : Math.ceil(best.workloadMinutesExact),
  };
}

/**
 * Computes FCFS position, customers ahead, ETA, and action eligibility for a single ticket.
 */
export function computeTicketStatusMetrics(entry, todayIst, staffBucket, noShowWindowMinutes = 10, now = new Date()) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();

  if (!entry) {
    return null;
  }

  if (TERMINAL_STATUSES.has(entry.status) || entry.queue_date !== todayIst) {
    return {
      queue_position: null,
      customers_ahead: null,
      estimated_wait_minutes: null,
      can_start_coming: false,
      can_cancel: false,
      service_timing: null,
      arrival_window: null,
    };
  }

  if (entry.status === 'In Chair') {
    const duration = staffBucket?.inChairEntry?.id === entry.id
      ? staffBucket.inChairEntry.total_duration_minutes
      : entry.total_duration_minutes;
    return {
      queue_position: 0,
      customers_ahead: 0,
      estimated_wait_minutes: 0,
      can_start_coming: false,
      can_cancel: false,
      service_timing: computeActiveServiceTiming(entry, duration, now),
      arrival_window: null,
    };
  }

  if (entry.status === 'Called') {
    const calledAtMs = parseTimestampMs(entry.called_at);
    const windowMs = noShowWindowMinutes * 60 * 1000;
    const deadlineMs = calledAtMs !== null ? calledAtMs + windowMs : null;
    const remainingSeconds =
      deadlineMs !== null && Number.isFinite(nowMs)
        ? Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000))
        : null;

    return {
      queue_position: 0,
      customers_ahead: 0,
      estimated_wait_minutes: 0,
      can_start_coming: false,
      can_cancel: false,
      service_timing: null,
      arrival_window: {
        window_minutes: noShowWindowMinutes,
        called_at: entry.called_at,
        expires_at: deadlineMs !== null ? new Date(deadlineMs).toISOString() : null,
        remaining_seconds: remainingSeconds,
      },
    };
  }

  // Waiting entry for today
  const waitingList = staffBucket?.waitingEntries || [];
  const waitingIndex = waitingList.findIndex((item) => item.id === entry.id);
  const queuePosition = waitingIndex >= 0 ? waitingIndex + 1 : 1;

  let etaExact = 0;
  let hasUnknownTiming = false;

  if (staffBucket?.inChairEntry) {
    const rem = staffBucket.inChairEntry.timing?.remaining_minutes_exact;
    if (rem === null || rem === undefined) {
      hasUnknownTiming = true;
    } else {
      etaExact += rem;
    }
  }

  for (const calledEntry of staffBucket?.calledEntries || []) {
    etaExact += calledEntry.total_duration_minutes || 0;
  }

  for (let i = 0; i < (waitingIndex >= 0 ? waitingIndex : 0); i += 1) {
    etaExact += waitingList[i].total_duration_minutes || 0;
  }

  return {
    queue_position: queuePosition,
    customers_ahead: Math.max(0, queuePosition - 1),
    estimated_wait_minutes: hasUnknownTiming ? null : Math.ceil(etaExact),
    can_start_coming: queuePosition === 2 && !entry.start_coming_at,
    can_cancel: true,
    service_timing: null,
    arrival_window: null,
  };
}

/**
 * Ensures documented lazy daily staff initialization (once per IST day) and
 * end-of-day cleanup (when last_cleanup_date is prior to today, or after closing
 * when today still has leftover Waiting/Called rows). Never runs cleanup unconditionally.
 */
export async function ensureDailyReadConsistency(supabase, settings, activeEntriesHint = null, now = new Date()) {
  const istClock = getIstClock(now);
  const operating = evaluateSalonOperatingStatus(settings, 0, now);

  let ranCleanup = false;
  let ranStaffInit = false;

  const needsPriorDayCleanup =
    settings?.last_cleanup_date === null ||
    settings?.last_cleanup_date < istClock.date;

  const hasOpenRowsAfterClose =
    operating.is_past_closing_time &&
    Array.isArray(activeEntriesHint) &&
    activeEntriesHint.some((e) => e.status === 'Waiting' || e.status === 'Called');

  if (needsPriorDayCleanup || hasOpenRowsAfterClose) {
    const { error: cleanupError } = await supabase.rpc('run_end_of_day_cleanup');
    if (cleanupError) {
      throw new Error(`CLEANUP_RPC_FAILED: ${cleanupError.message}`);
    }
    ranCleanup = true;
  }

  if (settings?.last_staff_init_date !== istClock.date) {
    const { error: initError } = await supabase.rpc('initialize_new_day_staff_availability');
    if (initError) {
      throw new Error(`STAFF_INIT_RPC_FAILED: ${initError.message}`);
    }
    ranStaffInit = true;
  }

  return { ranCleanup, ranStaffInit };
}

async function fetchPublicState(supabase, { includeServices = false, includeQualifications = false, now = new Date() } = {}) {
  const istClock = getIstClock(now);

  const { data: initialSettings, error: settingsErr } = await supabase
    .from('salon_settings')
    .select('*')
    .eq('id', 1)
    .single();

  if (settingsErr || !initialSettings) {
    throw new Error(`SETTINGS_LOAD_FAILED: ${settingsErr?.message || 'salon_settings missing'}`);
  }

  // Run conditional once-per-day lazy initialization / prior-day cleanup before reading staff & queue
  const { ranCleanup, ranStaffInit } = await ensureDailyReadConsistency(supabase, initialSettings, null, now);

  const settingsPromise = ranCleanup || ranStaffInit
    ? supabase.from('salon_settings').select('*').eq('id', 1).single()
    : Promise.resolve({ data: initialSettings, error: null });

  const staffPromise = supabase
    .from('staff')
    .select(
      'id, slug, name_en, name_gu, role_en, role_gu, speciality_en, speciality_gu, avatar_url, is_on_duty, availability_status, available_since, display_order'
    )
    .order('display_order', { ascending: true });

  const activeEntriesPromise = supabase
    .from('queue_entries')
    .select('id, queue_date, token_number, token_display, source, selection_mode, assigned_staff_id, status, joined_at, called_at, started_at')
    .eq('queue_date', istClock.date)
    .in('status', ACTIVE_STATUSES);

  const onlineCountPromise = supabase
    .from('queue_entries')
    .select('id', { count: 'exact', head: true })
    .eq('queue_date', istClock.date)
    .eq('source', 'online')
    .neq('status', 'Cancelled');

  const servicesPromise = includeServices
    ? supabase
        .from('services')
        .select('id, service_key, category, name_en, name_gu, duration_minutes, price_inr, is_active, display_order')
        .eq('is_active', true)
        .order('display_order', { ascending: true })
    : Promise.resolve({ data: [], error: null });

  const qualPromise = includeQualifications
    ? supabase.from('staff_services').select('staff_id, service_id')
    : Promise.resolve({ data: [], error: null });

  const [
    settingsRes,
    staffRes,
    activeEntriesRes,
    onlineCountRes,
    servicesRes,
    qualRes,
  ] = await Promise.all([
    settingsPromise,
    staffPromise,
    activeEntriesPromise,
    onlineCountPromise,
    servicesPromise,
    qualPromise,
  ]);

  if (settingsRes.error || !settingsRes.data) {
    throw new Error(`SETTINGS_RELOAD_FAILED: ${settingsRes.error?.message || 'Missing settings'}`);
  }
  if (staffRes.error) {
    throw new Error(`STAFF_LOAD_FAILED: ${staffRes.error.message}`);
  }
  if (activeEntriesRes.error) {
    throw new Error(`QUEUE_LOAD_FAILED: ${activeEntriesRes.error.message}`);
  }
  if (onlineCountRes.error) {
    throw new Error(`ONLINE_COUNT_FAILED: ${onlineCountRes.error.message}`);
  }
  if (servicesRes.error) {
    throw new Error(`SERVICES_LOAD_FAILED: ${servicesRes.error.message}`);
  }
  if (qualRes.error) {
    throw new Error(`STAFF_SERVICES_LOAD_FAILED: ${qualRes.error.message}`);
  }

  let activeEntries = activeEntriesRes.data || [];
  let settings = settingsRes.data;
  const operatingCheck = evaluateSalonOperatingStatus(settings, onlineCountRes.count || 0, now);

  // If business day just passed closing time and Waiting/Called rows still exist, run cleanup once
  if (
    operatingCheck.is_past_closing_time &&
    activeEntries.some((entry) => entry.status === 'Waiting' || entry.status === 'Called')
  ) {
    await ensureDailyReadConsistency(supabase, settings, activeEntries, now);
    const { data: refreshedEntries, error: refreshErr } = await supabase
      .from('queue_entries')
      .select('id, queue_date, token_number, token_display, source, selection_mode, assigned_staff_id, status, joined_at, called_at, started_at')
      .eq('queue_date', istClock.date)
      .in('status', ACTIVE_STATUSES);

    if (refreshErr) {
      throw new Error(`QUEUE_REFRESH_FAILED: ${refreshErr.message}`);
    }
    activeEntries = refreshedEntries || [];
  }

  // Batch load service duration/price snapshots for all active entries (zero N+1 queries)
  const entryServicesByEntryId = new Map();
  if (activeEntries.length > 0) {
    const entryIds = activeEntries.map((e) => e.id);
    const { data: qesRows, error: qesErr } = await supabase
      .from('queue_entry_services')
      .select('queue_entry_id, service_id, position, duration_minutes_snapshot, price_inr_snapshot')
      .in('queue_entry_id', entryIds)
      .order('position', { ascending: true });

    if (qesErr) {
      throw new Error(`QUEUE_SERVICES_LOAD_FAILED: ${qesErr.message}`);
    }

    for (const row of qesRows || []) {
      const list = entryServicesByEntryId.get(row.queue_entry_id) || [];
      list.push(row);
      entryServicesByEntryId.set(row.queue_entry_id, list);
    }
  }

  const staffSnapshot = buildStaffQueueSnapshot(staffRes.data || [], activeEntries, entryServicesByEntryId, now);

  return {
    settings,
    operating: operatingCheck,
    staff: staffRes.data || [],
    activeEntries,
    entryServicesByEntryId,
    staffSnapshot,
    services: servicesRes.data || [],
    qualifications: qualRes.data || [],
  };
}

/**
 * Builds GET /api/public/home payload (zero customer PII).
 */
export async function getHomeData(supabase, now = new Date()) {
  const state = await fetchPublicState(supabase, { now });

  let activeQueueCount = 0;
  let waitingCount = 0;
  let inChairCount = 0;
  let calledCount = 0;

  for (const entry of state.activeEntries) {
    activeQueueCount += 1;
    if (entry.status === 'Waiting') waitingCount += 1;
    else if (entry.status === 'Called') calledCount += 1;
    else if (entry.status === 'In Chair') inChairCount += 1;
  }

  const onDutyNotBreak = [];
  for (const bucket of state.staffSnapshot.values()) {
    if (bucket.staff.is_on_duty && bucket.staff.availability_status !== 'On Break') {
      onDutyNotBreak.push(bucket);
    }
  }

  let approximateWaitMinutes = null;
  if (onDutyNotBreak.length > 0) {
    const knownWorkloads = onDutyNotBreak
      .filter((b) => !b.hasUnknownTiming)
      .map((b) => Math.ceil(b.workloadMinutesExact));
    if (knownWorkloads.length > 0) {
      approximateWaitMinutes = Math.min(...knownWorkloads);
    }
  }

  const staffCards = state.staff.map((member) => {
    const bucket = state.staffSnapshot.get(member.id);
    return {
      id: member.id,
      slug: member.slug,
      name_en: member.name_en,
      name_gu: member.name_gu,
      role_en: member.role_en,
      role_gu: member.role_gu,
      speciality_en: member.speciality_en,
      speciality_gu: member.speciality_gu,
      avatar_url: member.avatar_url,
      is_on_duty: member.is_on_duty,
      availability_status: member.availability_status,
      waiting_count: bucket ? bucket.waitingEntries.length : 0,
    };
  });

  return {
    salon: {
      name: state.settings.salon_name,
      operating_hours: state.settings.operating_hours,
      ...state.operating,
    },
    queue_summary: {
      active_count: activeQueueCount,
      waiting_count: waitingCount,
      called_count: calledCount,
      in_chair_count: inChairCount,
      approximate_wait_minutes: approximateWaitMinutes,
      any_staff_available: onDutyNotBreak.some((b) => b.staff.availability_status === 'Available'),
      on_duty_staff_count: state.staff.filter((s) => s.is_on_duty).length,
    },
    staff: staffCards,
  };
}

/**
 * Builds GET /api/public/join-options payload with active services grouped by category,
 * staff qualifications, duty/availability, limits, and workloads for ETA previews.
 */
export async function getJoinOptionsData(supabase, now = new Date()) {
  const state = await fetchPublicState(supabase, {
    includeServices: true,
    includeQualifications: true,
    now,
  });

  const qualifiedStaffByService = new Map();
  const serviceIdsByStaff = new Map();

  for (const row of state.qualifications) {
    const staffSet = qualifiedStaffByService.get(row.service_id) || [];
    staffSet.push(row.staff_id);
    qualifiedStaffByService.set(row.service_id, staffSet);

    const svcSet = serviceIdsByStaff.get(row.staff_id) || [];
    svcSet.push(row.service_id);
    serviceIdsByStaff.set(row.staff_id, svcSet);
  }

  const services = state.services.map((svc) => ({
    id: svc.id,
    service_key: svc.service_key,
    category: svc.category,
    name_en: svc.name_en,
    name_gu: svc.name_gu,
    duration_minutes: svc.duration_minutes,
    price_inr: svc.price_inr,
    qualified_staff_ids: qualifiedStaffByService.get(svc.id) || [],
  }));

  const categories = {};
  for (const svc of services) {
    if (!categories[svc.category]) {
      categories[svc.category] = [];
    }
    categories[svc.category].push(svc);
  }

  const staff = state.staff.map((member) => {
    const bucket = state.staffSnapshot.get(member.id);
    return {
      id: member.id,
      slug: member.slug,
      name_en: member.name_en,
      name_gu: member.name_gu,
      role_en: member.role_en,
      role_gu: member.role_gu,
      speciality_en: member.speciality_en,
      speciality_gu: member.speciality_gu,
      avatar_url: member.avatar_url,
      is_on_duty: member.is_on_duty,
      availability_status: member.availability_status,
      available_since: member.available_since,
      qualified_service_ids: serviceIdsByStaff.get(member.id) || [],
      workload_minutes: bucket && !bucket.hasUnknownTiming ? Math.ceil(bucket.workloadMinutesExact) : null,
      waiting_count: bucket ? bucket.waitingEntries.length : 0,
    };
  });

  return {
    salon: {
      name: state.settings.salon_name,
      max_services_per_entry: state.settings.max_services_per_entry,
      ...state.operating,
    },
    categories,
    services,
    staff,
  };
}

/**
 * Builds GET /api/public/display payload (zero customer PII or entry UUIDs).
 */
export async function getDisplayData(supabase, now = new Date()) {
  const state = await fetchPublicState(supabase, { now });

  const staffById = new Map(state.staff.map((s) => [s.id, s]));

  const staffCards = state.staff.map((member) => {
    const bucket = state.staffSnapshot.get(member.id);
    const currentEntry = bucket?.inChairEntry || bucket?.calledEntries[0] || null;
    return {
      id: member.id,
      slug: member.slug,
      name_en: member.name_en,
      name_gu: member.name_gu,
      role_en: member.role_en,
      role_gu: member.role_gu,
      avatar_url: member.avatar_url,
      is_on_duty: member.is_on_duty,
      availability_status: member.availability_status,
      current_token_display: currentEntry ? currentEntry.token_display : null,
      current_entry_status: currentEntry ? currentEntry.status : null,
      called_at: currentEntry?.status === 'Called' ? currentEntry.called_at : null,
    };
  });

  const allWaiting = [];
  for (const bucket of state.staffSnapshot.values()) {
    for (const waitingEntry of bucket.waitingEntries) {
      const metrics = computeTicketStatusMetrics(
        waitingEntry,
        state.operating.queue_date,
        bucket,
        state.settings.no_show_window_minutes,
        now
      );
      const staffMember = staffById.get(waitingEntry.assigned_staff_id);
      allWaiting.push({
        token_display: waitingEntry.token_display,
        assigned_staff_id: waitingEntry.assigned_staff_id,
        assigned_staff_name_en: staffMember?.name_en || null,
        assigned_staff_name_gu: staffMember?.name_gu || null,
        estimated_wait_minutes: metrics?.estimated_wait_minutes ?? null,
        joined_at: waitingEntry.joined_at,
        token_number: waitingEntry.token_number,
      });
    }
  }

  allWaiting.sort(compareEntriesFcfs);
  const nextFiveWaiting = allWaiting.slice(0, 5).map(({ token_number: _tn, ...item }) => item);

  const calledTokens = [];
  for (const bucket of state.staffSnapshot.values()) {
    for (const calledEntry of bucket.calledEntries) {
      const staffMember = staffById.get(calledEntry.assigned_staff_id);
      calledTokens.push({
        token_display: calledEntry.token_display,
        assigned_staff_id: calledEntry.assigned_staff_id,
        assigned_staff_name_en: staffMember?.name_en || null,
        assigned_staff_name_gu: staffMember?.name_gu || null,
        called_at: calledEntry.called_at,
      });
    }
  }

  return {
    salon: {
      name: state.settings.salon_name,
      ...state.operating,
    },
    staff_cards: staffCards,
    called_tokens: calledTokens,
    next_waiting_tokens: nextFiveWaiting,
    total_waiting_count: allWaiting.length,
  };
}

/**
 * Loads customer-safe ticket status for GET /api/queue/status/:id (never includes phone).
 */
export async function getTicketStatus(supabase, entryId, now = new Date()) {
  const istClock = getIstClock(now);

  const { data: entry, error: entryErr } = await supabase
    .from('queue_entries')
    .select(
      'id, queue_date, token_number, token_display, customer_id, source, selection_mode, assigned_staff_id, status, joined_at, start_coming_at, called_at, started_at, completed_at, cancelled_at, cancelled_by, no_show_at'
    )
    .eq('id', entryId)
    .maybeSingle();

  if (entryErr) {
    throw new Error(`TICKET_LOAD_FAILED: ${entryErr.message}`);
  }
  if (!entry) {
    return null;
  }

  // Run conditional daily init/cleanup when checking an active today ticket
  const settingsPromise = supabase.from('salon_settings').select('*').eq('id', 1).single();
  const customerPromise = supabase.from('customers').select('name').eq('id', entry.customer_id).single();
  const staffPromise = supabase
    .from('staff')
    .select('id, slug, name_en, name_gu, role_en, role_gu, speciality_en, speciality_gu, avatar_url, availability_status')
    .eq('id', entry.assigned_staff_id)
    .single();
  const ticketServicesPromise = supabase
    .from('queue_entry_services')
    .select('service_id, position, service_name_en_snapshot, service_name_gu_snapshot, duration_minutes_snapshot, price_inr_snapshot')
    .eq('queue_entry_id', entry.id)
    .order('position', { ascending: true });

  const staffActiveQueuePromise =
    !TERMINAL_STATUSES.has(entry.status) && entry.queue_date === istClock.date
      ? supabase
          .from('queue_entries')
          .select('id, queue_date, token_number, token_display, assigned_staff_id, status, joined_at, called_at, started_at')
          .eq('queue_date', istClock.date)
          .eq('assigned_staff_id', entry.assigned_staff_id)
          .in('status', ACTIVE_STATUSES)
      : Promise.resolve({ data: [], error: null });

  const [settingsRes, customerRes, staffRes, ticketServicesRes, staffQueueRes] = await Promise.all([
    settingsPromise,
    customerPromise,
    staffPromise,
    ticketServicesPromise,
    staffActiveQueuePromise,
  ]);

  if (settingsRes.error || !settingsRes.data) {
    throw new Error(`SETTINGS_LOAD_FAILED: ${settingsRes.error?.message || 'Missing settings'}`);
  }
  if (customerRes.error || !customerRes.data) {
    throw new Error(`CUSTOMER_LOAD_FAILED: ${customerRes.error?.message || 'Missing customer'}`);
  }
  if (staffRes.error || !staffRes.data) {
    throw new Error(`STAFF_LOAD_FAILED: ${staffRes.error?.message || 'Missing staff'}`);
  }
  if (ticketServicesRes.error) {
    throw new Error(`TICKET_SERVICES_LOAD_FAILED: ${ticketServicesRes.error.message}`);
  }
  if (staffQueueRes.error) {
    throw new Error(`STAFF_QUEUE_LOAD_FAILED: ${staffQueueRes.error.message}`);
  }

  const serviceSummary = summarizeEntryServices(ticketServicesRes.data || []);
  const staffActiveEntries = staffQueueRes.data || [];
  const entryServicesByEntryId = new Map();
  entryServicesByEntryId.set(entry.id, ticketServicesRes.data || []);

  const otherIds = staffActiveEntries.map((item) => item.id).filter((id) => id !== entry.id);
  if (otherIds.length > 0) {
    const { data: otherSvcRows, error: otherSvcErr } = await supabase
      .from('queue_entry_services')
      .select('queue_entry_id, position, duration_minutes_snapshot, price_inr_snapshot')
      .in('queue_entry_id', otherIds)
      .order('position', { ascending: true });

    if (otherSvcErr) {
      throw new Error(`STAFF_QUEUE_SERVICES_FAILED: ${otherSvcErr.message}`);
    }

    for (const row of otherSvcRows || []) {
      const list = entryServicesByEntryId.get(row.queue_entry_id) || [];
      list.push(row);
      entryServicesByEntryId.set(row.queue_entry_id, list);
    }
  }

  const snapshot = buildStaffQueueSnapshot([staffRes.data], staffActiveEntries, entryServicesByEntryId, now);
  const staffBucket = snapshot.get(staffRes.data.id) || null;
  const metrics = computeTicketStatusMetrics(
    {
      ...entry,
      total_duration_minutes: serviceSummary.totalDurationMinutes,
    },
    istClock.date,
    staffBucket,
    settingsRes.data.no_show_window_minutes,
    now
  );

  return {
    entry_id: entry.id,
    queue_date: entry.queue_date,
    token_number: entry.token_number,
    token_display: entry.token_display,
    status: entry.status,
    source: entry.source,
    selection_mode: entry.selection_mode,
    customer_name: customerRes.data.name,
    services: serviceSummary.services,
    total_duration_minutes: serviceSummary.totalDurationMinutes,
    total_price_inr: serviceSummary.totalPriceInr,
    assigned_staff: staffRes.data,
    joined_at: entry.joined_at,
    start_coming_at: entry.start_coming_at,
    called_at: entry.called_at,
    started_at: entry.started_at,
    completed_at: entry.completed_at,
    cancelled_at: entry.cancelled_at,
    cancelled_by: entry.cancelled_by,
    no_show_at: entry.no_show_at,
    ...metrics,
  };
}

const RPC_ERROR_MAP = Object.freeze({
  INVALID_CUSTOMER_NAME: { status: 400, message: 'Customer name is required.' },
  INVALID_PHONE_NUMBER: { status: 400, message: 'Phone number must contain exactly 10 digits.' },
  INVALID_SOURCE: { status: 400, message: 'Invalid queue source.' },
  INVALID_SELECTION_MODE: { status: 400, message: 'Invalid staff selection mode.' },
  PREFERRED_STAFF_REQUIRED: { status: 400, message: 'Please choose a stylist for specific stylist selection.' },
  INVALID_SERVICES: { status: 400, message: 'Please select between 1 and 3 services.' },
  INVALID_SERVICE_COUNT: { status: 400, message: 'You can select between 1 and 3 services.' },
  DUPLICATE_SERVICES_NOT_ALLOWED: { status: 400, message: 'Selected services must be distinct.' },
  INACTIVE_OR_UNKNOWN_SERVICE: { status: 400, message: 'One or more selected services are unavailable.' },
  ENTRY_ID_REQUIRED: { status: 400, message: 'Valid queue entry ID is required.' },
  STAFF_NOT_FOUND: { status: 404, message: 'Selected stylist was not found.' },
  ENTRY_NOT_FOUND: { status: 404, message: 'Queue entry was not found.' },
  DUPLICATE_ACTIVE_ENTRY: { status: 409, message: 'This phone number already has an active queue entry today.' },
  SALON_CLOSED: { status: 409, message: 'The salon is currently closed.' },
  ONLINE_QUEUE_CLOSED: { status: 409, message: 'Online queue registration is currently closed.' },
  ONLINE_CUTOFF_PASSED: { status: 409, message: 'Online queue registration has closed for today before closing time.' },
  ONLINE_CAPACITY_FULL: { status: 409, message: 'Daily online registration capacity has been reached.' },
  STYLIST_OFF_DUTY: { status: 409, message: 'Selected stylist is currently off duty.' },
  STYLIST_ON_BREAK: { status: 409, message: 'Selected stylist is currently on break.' },
  STYLIST_NOT_QUALIFIED: { status: 409, message: 'Selected stylist is not qualified for all selected services.' },
  NO_ELIGIBLE_STYLIST_AVAILABLE: { status: 409, message: 'No qualified stylist is currently available for your selected services.' },
  START_COMING_NOT_ALLOWED: { status: 409, message: 'Start Coming is only available for today while Waiting.' },
  START_COMING_POSITION_INVALID: { status: 409, message: 'Start Coming is only available when you are at position 2 in line.' },
  CUSTOMER_CANCEL_ONLY_WAITING: { status: 409, message: 'You can cancel online only while your status is Waiting.' },
  RECEPTION_CANCEL_NOT_ALLOWED: { status: 409, message: 'Reception can cancel only Waiting or Called entries.' },
  CORRECTION_FIELDS_REQUIRED: { status: 400, message: 'Provide a customer name or at least one service to update.' },
  CORRECTION_ONLY_WAITING: { status: 409, message: 'Queue entries can be corrected only while their status is Waiting.' },
  STAFF_ID_REQUIRED: { status: 400, message: 'A valid staff ID is required.' },
  INVALID_ARGUMENTS: { status: 400, message: 'Missing or invalid request arguments.' },
  INVALID_ACTOR_ROLE: { status: 400, message: 'Invalid actor role.' },
  INVALID_AVAILABILITY_STATUS: { status: 400, message: 'Availability status must be Available or On Break.' },
  INVALID_CANCEL_ACTOR: { status: 400, message: 'Invalid cancellation actor.' },
  STAFF_BUSY_CANNOT_TAKE_BREAK: { status: 409, message: 'Staff member cannot go on break while serving or holding a called customer.' },
  STAFF_BUSY_CANNOT_BECOME_AVAILABLE: { status: 409, message: 'Staff member cannot become Available while serving or holding a called customer.' },
  STAFF_OFF_DUTY: { status: 409, message: 'Staff member is currently off duty.' },
  STAFF_NOT_AVAILABLE: { status: 409, message: 'Staff member must be Available to call the next customer.' },
  STAFF_ALREADY_HAS_ACTIVE_ENTRY: { status: 409, message: 'Staff member already has an active Called or In Chair customer today.' },
  NO_WAITING_CUSTOMERS: { status: 404, message: 'No waiting customers are assigned to this staff member.' },
  STAFF_NOT_QUALIFIED_FOR_ENTRY: { status: 409, message: 'Staff member is not qualified for all services on this queue entry.' },
  ENTRY_NOT_ASSIGNED_TO_STAFF: { status: 403, message: 'Queue entry is not assigned to this staff member.' },
  ENTRY_NOT_FOR_TODAY: { status: 409, message: 'Cannot start a queue entry from a previous date.' },
  ENTRY_MUST_BE_CALLED: { status: 409, message: 'Service can only start when the entry status is Called.' },
  STAFF_ALREADY_BUSY: { status: 409, message: 'Staff member is already serving another customer.' },
  ENTRY_MUST_BE_IN_CHAIR: { status: 409, message: 'Service can only be completed when status is In Chair.' },
  NO_SHOW_ONLY_FROM_CALLED: { status: 409, message: 'Only Called entries can be marked as No-show.' },
  NO_SHOW_WINDOW_NOT_EXPIRED: { status: 409, message: 'Cannot mark No-show before the 10-minute arrival window expires.' },
  INVALID_SERVICE_CATEGORY: { status: 400, message: 'Invalid service category.', useRawDetail: true },
  INVALID_SERVICE_NAME: { status: 400, message: 'Service name is required in both English and Gujarati.', useRawDetail: true },
  INVALID_SERVICE_DURATION: { status: 400, message: 'Service duration must be greater than zero.', useRawDetail: true },
  INVALID_SERVICE_PRICE: { status: 400, message: 'Service price must be zero or greater.', useRawDetail: true },
  INVALID_SERVICE_KEY: { status: 400, message: 'Invalid service key format.', useRawDetail: true },
  SERVICE_ID_REQUIRED: { status: 400, message: 'Valid service ID is required.' },
  INVALID_STAFF_IDS: { status: 400, message: 'Selected stylist IDs are invalid.', useRawDetail: true },
  INVALID_SERVICE_IDS: { status: 400, message: 'Selected service IDs are invalid.', useRawDetail: true },
  INVALID_STAFF_SLUG: { status: 400, message: 'Invalid stylist slug format.', useRawDetail: true },
  INVALID_STAFF_PROFILE: { status: 400, message: 'Name, role, and speciality are required in both English and Gujarati.', useRawDetail: true },
  INVALID_OPERATING_HOURS: { status: 400, message: 'Operating hours format is invalid.', useRawDetail: true },
  INVALID_DAILY_CAPACITY: { status: 400, message: 'Daily online capacity must be a non-negative integer.', useRawDetail: true },
  INVALID_ONLINE_CUTOFF: { status: 400, message: 'Online cutoff minutes must be a non-negative integer.', useRawDetail: true },
  SERVICE_NOT_FOUND: { status: 404, message: 'Selected service was not found.', useRawDetail: true },
  SETTINGS_MISSING: { status: 404, message: 'Salon settings record was not found.' },
  DUPLICATE_SERVICE_KEY: { status: 409, message: 'A service with this service key already exists.', useRawDetail: true },
  DUPLICATE_SERVICE_NAME: { status: 409, message: 'A service with this name already exists.', useRawDetail: true },
  DUPLICATE_STAFF_SLUG: { status: 409, message: 'This stylist slug is already in use.', useRawDetail: true },
  ACTIVE_SERVICE_REQUIRES_QUALIFIED_STAFF: { status: 409, message: 'Every active service must have at least one qualified stylist.', useRawDetail: true },
  STAFF_ACTIVE_CANNOT_GO_OFF_DUTY: { status: 409, message: 'Cannot mark stylist off duty while serving or holding a called customer.' },
  INVALID_APPOINTMENT_SLOT: { status: 400, message: 'Appointment date and start time are required.' },
  PAST_APPOINTMENT_DATE: { status: 400, message: 'Cannot book an appointment in the past.' },
  PAST_APPOINTMENT_TIME: { status: 400, message: 'Selected time slot has already passed.' },
  APPOINTMENT_DAY_CLOSED: { status: 409, message: 'The salon is closed on the selected date.' },
  OUTSIDE_OPERATING_HOURS: { status: 400, message: 'Selected slot and service duration exceed salon operating hours.' },
  DUPLICATE_CUSTOMER_APPOINTMENT: { status: 409, message: 'You already have an overlapping appointment on this date.' },
  SLOT_UNAVAILABLE: { status: 409, message: 'No qualified stylist is available for this time slot.', useRawDetail: true },
  APPOINTMENT_ID_REQUIRED: { status: 400, message: 'Valid appointment ID is required.' },
  APPOINTMENT_NOT_FOUND: { status: 404, message: 'Appointment was not found.' },
  APPOINTMENT_CANCEL_NOT_ALLOWED: { status: 409, message: 'Only Booked or Confirmed appointments can be cancelled.' },
  APPOINTMENT_ALREADY_CHECKED_IN: { status: 409, message: 'This appointment has already been checked in.' },
  APPOINTMENT_CHECKIN_NOT_ALLOWED: { status: 409, message: 'Only Booked or Confirmed appointments can be checked in.' },
  APPOINTMENT_NOT_TODAY: { status: 409, message: 'Only appointments scheduled for today can be checked into the live queue.' },
  APPOINTMENT_NOSHOW_NOT_ALLOWED: { status: 409, message: 'Only Booked or Confirmed appointments can be marked No Show.' },
});

/**
 * Maps PostgreSQL RPC errors safely to HTTP status & customer-friendly messages
 * without leaking SQL internals, constraints, or PII.
 */
export function mapQueueRpcError(error) {
  const rawMessage = typeof error?.message === 'string' ? error.message : '';
  const colonIdx = rawMessage.indexOf(':');
  const codePrefix = (colonIdx === -1 ? rawMessage : rawMessage.slice(0, colonIdx)).trim();

  if (codePrefix && RPC_ERROR_MAP[codePrefix]) {
    const entry = RPC_ERROR_MAP[codePrefix];
    const detail = colonIdx !== -1 ? rawMessage.slice(colonIdx + 1).trim() : '';
    return {
      status: entry.status,
      code: codePrefix,
      message: entry.useRawDetail && detail ? detail : entry.message,
    };
  }

  if (error?.code === 'PGRST202') {
    return {
      status: 503,
      code: 'MIGRATION_008_REQUIRED',
      message: 'Required database RPC functions are missing. Apply Migration 008 in Supabase SQL Editor.',
    };
  }

  if (error?.code === '23505') {
    return {
      status: 409,
      code: 'DUPLICATE_ACTIVE_ENTRY',
      message: RPC_ERROR_MAP.DUPLICATE_ACTIVE_ENTRY.message,
    };
  }

  return {
    status: 503,
    code: 'QUEUE_SERVICE_UNAVAILABLE',
    message: 'Queue service is temporarily unavailable. Please try again.',
  };
}

/**
 * Builds the Reception Dashboard payload (includes customer name + phone as permitted).
 */
export async function getReceptionDashboardData(supabase, now = new Date()) {
  const istClock = getIstClock(now);
  const nowMs = istClock.nowMs;

  const { data: initialSettings, error: settingsErr } = await supabase
    .from('salon_settings')
    .select('*')
    .eq('id', 1)
    .single();

  if (settingsErr || !initialSettings) {
    throw new Error(`SETTINGS_LOAD_FAILED: ${settingsErr?.message || 'salon_settings missing'}`);
  }

  const { ranCleanup, ranStaffInit } = await ensureDailyReadConsistency(supabase, initialSettings, null, now);

  const settingsPromise = ranCleanup || ranStaffInit
    ? supabase.from('salon_settings').select('*').eq('id', 1).single()
    : Promise.resolve({ data: initialSettings, error: null });

  const staffPromise = supabase
    .from('staff')
    .select(
      'id, slug, name_en, name_gu, role_en, role_gu, speciality_en, speciality_gu, avatar_url, is_on_duty, availability_status, available_since, display_order'
    )
    .order('display_order', { ascending: true });

  const entriesPromise = supabase
    .from('queue_entries')
    .select(
      'id, queue_date, token_number, token_display, customer_id, source, selection_mode, assigned_staff_id, status, joined_at, start_coming_at, called_at, started_at, completed_at, cancelled_at, cancelled_by, no_show_at'
    )
    .eq('queue_date', istClock.date);

  const statsPromise = supabase
    .from('daily_queue_statistics')
    .select('*')
    .eq('queue_date', istClock.date)
    .maybeSingle();

  const servicesPromise = supabase
    .from('services')
    .select('id, service_key, category, name_en, name_gu, duration_minutes, price_inr, is_active, display_order')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  const qualPromise = supabase.from('staff_services').select('staff_id, service_id');

  const [settingsRes, staffRes, entriesRes, statsRes, servicesRes, qualRes] = await Promise.all([
    settingsPromise,
    staffPromise,
    entriesPromise,
    statsPromise,
    servicesPromise,
    qualPromise,
  ]);

  if (settingsRes.error || !settingsRes.data) {
    throw new Error(`SETTINGS_RELOAD_FAILED: ${settingsRes.error?.message || 'Missing settings'}`);
  }
  if (staffRes.error) throw new Error(`STAFF_LOAD_FAILED: ${staffRes.error.message}`);
  if (entriesRes.error) throw new Error(`QUEUE_LOAD_FAILED: ${entriesRes.error.message}`);
  if (statsRes.error) throw new Error(`STATS_LOAD_FAILED: ${statsRes.error.message}`);
  if (servicesRes.error) throw new Error(`SERVICES_LOAD_FAILED: ${servicesRes.error.message}`);
  if (qualRes.error) throw new Error(`STAFF_SERVICES_LOAD_FAILED: ${qualRes.error.message}`);

  const settings = settingsRes.data;
  const allEntries = entriesRes.data || [];
  const onlineEntriesToday = allEntries.filter((e) => e.source === 'online' && e.status !== 'Cancelled').length;
  const operating = evaluateSalonOperatingStatus(settings, onlineEntriesToday, now);

  const activeEntries = allEntries.filter((e) => ACTIVE_STATUSES.includes(e.status));
  const entryIds = activeEntries.map((e) => e.id);
  const customerIds = [...new Set(activeEntries.map((e) => e.customer_id).filter(Boolean))];

  const [qesRes, customersRes] = await Promise.all([
    entryIds.length > 0
      ? supabase
          .from('queue_entry_services')
          .select('queue_entry_id, service_id, position, service_name_en_snapshot, service_name_gu_snapshot, duration_minutes_snapshot, price_inr_snapshot')
          .in('queue_entry_id', entryIds)
          .order('position', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    customerIds.length > 0
      ? supabase.from('customers').select('id, name, phone').in('id', customerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (qesRes.error) throw new Error(`QUEUE_SERVICES_LOAD_FAILED: ${qesRes.error.message}`);
  if (customersRes.error) throw new Error(`CUSTOMERS_LOAD_FAILED: ${customersRes.error.message}`);

  const entryServicesByEntryId = new Map();
  for (const row of qesRes.data || []) {
    const list = entryServicesByEntryId.get(row.queue_entry_id) || [];
    list.push(row);
    entryServicesByEntryId.set(row.queue_entry_id, list);
  }

  const customersById = new Map((customersRes.data || []).map((c) => [c.id, c]));
  const staffList = staffRes.data || [];
  const staffById = new Map(staffList.map((s) => [s.id, s]));
  const staffSnapshot = buildStaffQueueSnapshot(staffList, activeEntries, entryServicesByEntryId, now);

  const formatReceptionEntry = (entry) => {
    const customer = customersById.get(entry.customer_id);
    const staffMember = staffById.get(entry.assigned_staff_id);
    const bucket = staffSnapshot.get(entry.assigned_staff_id);
    const svcSummary = summarizeEntryServices(entryServicesByEntryId.get(entry.id) || []);
    const metrics = computeTicketStatusMetrics(
      { ...entry, total_duration_minutes: svcSummary.totalDurationMinutes },
      istClock.date,
      bucket,
      settings.no_show_window_minutes,
      now
    );

    const joinedAtMs = parseTimestampMs(entry.joined_at);
    const waitedMinutes =
      joinedAtMs !== null ? Math.max(0, Math.floor((nowMs - joinedAtMs) / 60000)) : null;
    const canMarkNoShow =
      entry.status === 'Called' &&
      metrics?.arrival_window?.remaining_seconds === 0;

    return {
      entry_id: entry.id,
      queue_date: entry.queue_date,
      token_number: entry.token_number,
      token_display: entry.token_display,
      status: entry.status,
      source: entry.source,
      selection_mode: entry.selection_mode,
      customer_name: customer?.name || null,
      customer_phone: customer?.phone || null,
      assigned_staff: staffMember
        ? {
            id: staffMember.id,
            slug: staffMember.slug,
            name_en: staffMember.name_en,
            name_gu: staffMember.name_gu,
          }
        : null,
      services: svcSummary.services,
      total_duration_minutes: svcSummary.totalDurationMinutes,
      total_price_inr: svcSummary.totalPriceInr,
      joined_at: entry.joined_at,
      waited_minutes: waitedMinutes,
      is_waiting_over_60_minutes: entry.status === 'Waiting' && waitedMinutes !== null && waitedMinutes > 60,
      start_coming_at: entry.start_coming_at,
      is_customer_on_the_way: Boolean(entry.start_coming_at),
      called_at: entry.called_at,
      started_at: entry.started_at,
      queue_position: metrics?.queue_position ?? null,
      customers_ahead: metrics?.customers_ahead ?? null,
      estimated_wait_minutes: metrics?.estimated_wait_minutes ?? null,
      service_timing: metrics?.service_timing ?? null,
      arrival_window: metrics?.arrival_window ?? null,
      can_mark_no_show: canMarkNoShow,
      can_cancel: entry.status === 'Waiting' || entry.status === 'Called',
      can_start_service: entry.status === 'Called',
      can_complete_service: entry.status === 'In Chair',
      can_correct: entry.status === 'Waiting',
    };
  };

  const formattedWaitingAndCalled = activeEntries
    .filter((e) => e.status === 'Waiting' || e.status === 'Called')
    .sort(compareEntriesFcfs)
    .map(formatReceptionEntry);

  const formattedInChair = activeEntries
    .filter((e) => e.status === 'In Chair')
    .sort(compareEntriesFcfs)
    .map(formatReceptionEntry);

  const waitingEtas = formattedWaitingAndCalled
    .filter((e) => e.status === 'Waiting' && e.estimated_wait_minutes !== null)
    .map((e) => e.estimated_wait_minutes);
  const averageEstimatedWaitMinutes =
    waitingEtas.length > 0
      ? Math.round(waitingEtas.reduce((acc, v) => acc + v, 0) / waitingEtas.length)
      : 0;

  const staffCards = staffList.map((member) => {
    const bucket = staffSnapshot.get(member.id);
    const activeEntry = bucket?.inChairEntry || bucket?.calledEntries[0] || null;
    const formattedCurrent = activeEntry ? formatReceptionEntry(activeEntry) : null;
    const hasActiveChair = Boolean(bucket?.inChairEntry || (bucket?.calledEntries?.length || 0) > 0);

    return {
      id: member.id,
      slug: member.slug,
      name_en: member.name_en,
      name_gu: member.name_gu,
      role_en: member.role_en,
      role_gu: member.role_gu,
      speciality_en: member.speciality_en,
      speciality_gu: member.speciality_gu,
      avatar_url: member.avatar_url,
      is_on_duty: member.is_on_duty,
      availability_status: member.availability_status,
      waiting_count: bucket ? bucket.waitingEntries.length : 0,
      current_entry: formattedCurrent,
      can_call_next:
        Boolean(member.is_on_duty) &&
        member.availability_status === 'Available' &&
        !hasActiveChair &&
        (bucket?.waitingEntries?.length || 0) > 0,
    };
  });

  const statsRow = statsRes.data || {};
  const waitingCount = allEntries.filter((e) => e.status === 'Waiting').length;
  const calledCount = allEntries.filter((e) => e.status === 'Called').length;
  const inChairCount = allEntries.filter((e) => e.status === 'In Chair').length;
  const servedCount = Number(statsRow.served_count ?? allEntries.filter((e) => e.status === 'Done').length);

  return {
    salon: {
      name: settings.salon_name,
      max_services_per_entry: settings.max_services_per_entry,
      ...operating,
    },
    summary: {
      total_entries: Number(statsRow.total_entries ?? allEntries.length),
      waiting_count: waitingCount,
      called_count: calledCount,
      in_chair_count: inChairCount,
      served_count: servedCount,
      cancelled_count: Number(statsRow.cancelled_count ?? allEntries.filter((e) => e.status === 'Cancelled').length),
      no_show_count: Number(statsRow.no_show_count ?? allEntries.filter((e) => e.status === 'No-show').length),
      completed_services_count: Number(statsRow.completed_services_count ?? 0),
      daily_revenue_inr: Number(statsRow.daily_revenue_inr ?? 0),
      average_estimated_wait_minutes: averageEstimatedWaitMinutes,
    },
    staff_cards: staffCards,
    in_chair_entries: formattedInChair,
    queue_entries: formattedWaitingAndCalled,
    walk_in_options: {
      services: servicesRes.data || [],
      qualifications: qualRes.data || [],
    },
  };
}

/**
 * Loads full Reception entry details (including customer phone) for GET /api/reception/entries/:id.
 */
export async function getReceptionEntryDetails(supabase, entryId, now = new Date()) {
  const istClock = getIstClock(now);
  const nowMs = istClock.nowMs;

  const { data: entry, error: entryErr } = await supabase
    .from('queue_entries')
    .select(
      'id, queue_date, token_number, token_display, customer_id, source, selection_mode, assigned_staff_id, status, joined_at, start_coming_at, called_at, started_at, completed_at, cancelled_at, cancelled_by, no_show_at'
    )
    .eq('id', entryId)
    .maybeSingle();

  if (entryErr) throw new Error(`ENTRY_LOAD_FAILED: ${entryErr.message}`);
  if (!entry) return null;

  const [settingsRes, customerRes, staffRes, servicesRes, staffQueueRes] = await Promise.all([
    supabase.from('salon_settings').select('*').eq('id', 1).single(),
    supabase.from('customers').select('id, name, phone').eq('id', entry.customer_id).single(),
    supabase
      .from('staff')
      .select('id, slug, name_en, name_gu, role_en, role_gu, speciality_en, speciality_gu, avatar_url, is_on_duty, availability_status')
      .eq('id', entry.assigned_staff_id)
      .single(),
    supabase
      .from('queue_entry_services')
      .select('service_id, position, service_name_en_snapshot, service_name_gu_snapshot, duration_minutes_snapshot, price_inr_snapshot')
      .eq('queue_entry_id', entry.id)
      .order('position', { ascending: true }),
    !TERMINAL_STATUSES.has(entry.status) && entry.queue_date === istClock.date
      ? supabase
          .from('queue_entries')
          .select('id, queue_date, token_number, token_display, assigned_staff_id, status, joined_at, called_at, started_at')
          .eq('queue_date', istClock.date)
          .eq('assigned_staff_id', entry.assigned_staff_id)
          .in('status', ACTIVE_STATUSES)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (settingsRes.error || !settingsRes.data) throw new Error('SETTINGS_LOAD_FAILED');
  if (customerRes.error || !customerRes.data) throw new Error('CUSTOMER_LOAD_FAILED');
  if (staffRes.error || !staffRes.data) throw new Error('STAFF_LOAD_FAILED');
  if (servicesRes.error) throw new Error('ENTRY_SERVICES_LOAD_FAILED');
  if (staffQueueRes.error) throw new Error('STAFF_QUEUE_LOAD_FAILED');

  const svcSummary = summarizeEntryServices(servicesRes.data || []);
  const staffActiveEntries = staffQueueRes.data || [];
  const entryServicesByEntryId = new Map([[entry.id, servicesRes.data || []]]);

  const otherIds = staffActiveEntries.map((i) => i.id).filter((id) => id !== entry.id);
  if (otherIds.length > 0) {
    const { data: otherSvcRows, error: otherSvcErr } = await supabase
      .from('queue_entry_services')
      .select('queue_entry_id, position, duration_minutes_snapshot, price_inr_snapshot')
      .in('queue_entry_id', otherIds)
      .order('position', { ascending: true });
    if (otherSvcErr) throw new Error('OTHER_ENTRY_SERVICES_LOAD_FAILED');
    for (const row of otherSvcRows || []) {
      const list = entryServicesByEntryId.get(row.queue_entry_id) || [];
      list.push(row);
      entryServicesByEntryId.set(row.queue_entry_id, list);
    }
  }

  const snapshot = buildStaffQueueSnapshot([staffRes.data], staffActiveEntries, entryServicesByEntryId, now);
  const bucket = snapshot.get(staffRes.data.id) || null;
  const metrics = computeTicketStatusMetrics(
    { ...entry, total_duration_minutes: svcSummary.totalDurationMinutes },
    istClock.date,
    bucket,
    settingsRes.data.no_show_window_minutes,
    now
  );

  const joinedAtMs = parseTimestampMs(entry.joined_at);
  const waitedMinutes = joinedAtMs !== null ? Math.max(0, Math.floor((nowMs - joinedAtMs) / 60000)) : null;

  return {
    entry_id: entry.id,
    queue_date: entry.queue_date,
    token_number: entry.token_number,
    token_display: entry.token_display,
    status: entry.status,
    source: entry.source,
    selection_mode: entry.selection_mode,
    customer_name: customerRes.data.name,
    customer_phone: customerRes.data.phone,
    services: svcSummary.services,
    total_duration_minutes: svcSummary.totalDurationMinutes,
    total_price_inr: svcSummary.totalPriceInr,
    assigned_staff: staffRes.data,
    joined_at: entry.joined_at,
    waited_minutes: waitedMinutes,
    is_waiting_over_60_minutes: entry.status === 'Waiting' && waitedMinutes !== null && waitedMinutes > 60,
    start_coming_at: entry.start_coming_at,
    is_customer_on_the_way: Boolean(entry.start_coming_at),
    called_at: entry.called_at,
    started_at: entry.started_at,
    completed_at: entry.completed_at,
    cancelled_at: entry.cancelled_at,
    cancelled_by: entry.cancelled_by,
    no_show_at: entry.no_show_at,
    ...metrics,
    can_mark_no_show: entry.status === 'Called' && metrics?.arrival_window?.remaining_seconds === 0,
    can_cancel: entry.status === 'Waiting' || entry.status === 'Called',
    can_correct: entry.status === 'Waiting',
  };
}

/**
 * Builds the Staff dashboard payload strictly for the authenticated staff member.
 * Returns assigned customer names ONLY — never exposes customer phone numbers.
 */
export async function getStaffDashboardData(supabase, staffMember, now = new Date()) {
  const istClock = getIstClock(now);

  const { data: initialSettings, error: settingsErr } = await supabase
    .from('salon_settings')
    .select('*')
    .eq('id', 1)
    .single();

  if (settingsErr || !initialSettings) {
    throw new Error(`SETTINGS_LOAD_FAILED: ${settingsErr?.message || 'salon_settings missing'}`);
  }

  const { ranCleanup, ranStaffInit } = await ensureDailyReadConsistency(supabase, initialSettings, null, now);

  const settingsPromise = ranCleanup || ranStaffInit
    ? supabase.from('salon_settings').select('*').eq('id', 1).single()
    : Promise.resolve({ data: initialSettings, error: null });

  const staffPromise = supabase
    .from('staff')
    .select(
      'id, slug, name_en, name_gu, role_en, role_gu, speciality_en, speciality_gu, avatar_url, is_on_duty, availability_status, available_since'
    )
    .eq('id', staffMember.id)
    .single();

  const queuePromise = supabase
    .from('queue_entries')
    .select(
      'id, queue_date, token_number, token_display, customer_id, source, selection_mode, assigned_staff_id, status, joined_at, start_coming_at, called_at, started_at'
    )
    .eq('queue_date', istClock.date)
    .eq('assigned_staff_id', staffMember.id)
    .in('status', ACTIVE_STATUSES);

  const [settingsRes, staffRes, queueRes] = await Promise.all([
    settingsPromise,
    staffPromise,
    queuePromise,
  ]);

  if (settingsRes.error || !settingsRes.data) throw new Error('SETTINGS_LOAD_FAILED');
  if (staffRes.error || !staffRes.data) throw new Error('STAFF_LOAD_FAILED');
  if (queueRes.error) throw new Error('STAFF_QUEUE_LOAD_FAILED');

  const settings = settingsRes.data;
  const freshStaff = staffRes.data;
  const activeEntries = queueRes.data || [];
  const entryIds = activeEntries.map((e) => e.id);
  const customerIds = [...new Set(activeEntries.map((e) => e.customer_id).filter(Boolean))];

  // Strictly select customer name ONLY — never select or expose phone numbers to Staff
  const [qesRes, customersRes] = await Promise.all([
    entryIds.length > 0
      ? supabase
          .from('queue_entry_services')
          .select('queue_entry_id, service_id, position, service_name_en_snapshot, service_name_gu_snapshot, duration_minutes_snapshot, price_inr_snapshot')
          .in('queue_entry_id', entryIds)
          .order('position', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    customerIds.length > 0
      ? supabase.from('customers').select('id, name').in('id', customerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (qesRes.error) throw new Error('STAFF_QUEUE_SERVICES_FAILED');
  if (customersRes.error) throw new Error('STAFF_CUSTOMERS_FAILED');

  const entryServicesByEntryId = new Map();
  for (const row of qesRes.data || []) {
    const list = entryServicesByEntryId.get(row.queue_entry_id) || [];
    list.push(row);
    entryServicesByEntryId.set(row.queue_entry_id, list);
  }

  const customerNamesById = new Map((customersRes.data || []).map((c) => [c.id, c.name]));
  const snapshot = buildStaffQueueSnapshot([freshStaff], activeEntries, entryServicesByEntryId, now);
  const bucket = snapshot.get(freshStaff.id);

  const formatStaffEntry = (entry) => {
    const svcSummary = summarizeEntryServices(entryServicesByEntryId.get(entry.id) || []);
    const metrics = computeTicketStatusMetrics(
      { ...entry, total_duration_minutes: svcSummary.totalDurationMinutes },
      istClock.date,
      bucket,
      settings.no_show_window_minutes,
      now
    );

    return {
      entry_id: entry.id,
      queue_date: entry.queue_date,
      token_number: entry.token_number,
      token_display: entry.token_display,
      status: entry.status,
      source: entry.source,
      customer_name: customerNamesById.get(entry.customer_id) || null,
      services: svcSummary.services,
      total_duration_minutes: svcSummary.totalDurationMinutes,
      total_price_inr: svcSummary.totalPriceInr,
      joined_at: entry.joined_at,
      start_coming_at: entry.start_coming_at,
      is_customer_on_the_way: Boolean(entry.start_coming_at),
      called_at: entry.called_at,
      started_at: entry.started_at,
      queue_position: metrics?.queue_position ?? null,
      estimated_wait_minutes: metrics?.estimated_wait_minutes ?? null,
      service_timing: metrics?.service_timing ?? null,
      arrival_window: metrics?.arrival_window ?? null,
      can_start_service: entry.status === 'Called',
      can_complete_service: entry.status === 'In Chair',
      can_mark_no_show: entry.status === 'Called' && metrics?.arrival_window?.remaining_seconds === 0,
    };
  };

  const currentRaw = bucket?.inChairEntry || bucket?.calledEntries[0] || null;
  const currentEntry = currentRaw ? formatStaffEntry(currentRaw) : null;
  const waitingQueue = (bucket?.waitingEntries || []).map(formatStaffEntry);
  const nextCustomer = waitingQueue[0] || null;
  const hasActiveChair = Boolean(bucket?.inChairEntry || (bucket?.calledEntries?.length || 0) > 0);

  return {
    queue_date: istClock.date,
    staff: freshStaff,
    current_entry: currentEntry,
    next_customer: nextCustomer,
    waiting_queue: waitingQueue,
    waiting_count: waitingQueue.length,
    can_call_next:
      Boolean(freshStaff.is_on_duty) &&
      freshStaff.availability_status === 'Available' &&
      !hasActiveChair &&
      waitingQueue.length > 0,
    can_change_availability: !hasActiveChair && freshStaff.availability_status !== 'Busy',
  };
}
