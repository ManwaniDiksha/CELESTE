const SALON_TIMEZONE = 'Asia/Kolkata';

/**
 * Formats a "HH:MM" 24-hour string into a localized 12-hour label.
 */
export function formatTimeHhMm(hhmm, lang = 'en') {
  if (typeof hhmm !== 'string' || !hhmm.includes(':')) {
    return '—';
  }

  const [rawHour, rawMin] = hhmm.split(':').map(Number);
  if (!Number.isInteger(rawHour) || !Number.isInteger(rawMin)) {
    return hhmm;
  }

  const suffixEn = rawHour >= 12 ? 'PM' : 'AM';
  const hour12 = rawHour % 12 === 0 ? 12 : rawHour % 12;
  const mins = String(rawMin).padStart(2, '0');

  if (lang === 'gu') {
    const periodGu = rawHour < 12 ? 'સવારે' : rawHour < 17 ? 'બપોરે' : 'સાંજે';
    return `${periodGu} ${hour12}:${mins}`;
  }

  return `${hour12}:${mins} ${suffixEn}`;
}

/**
 * Formats a YYYY-MM-DD date string nicely in IST context.
 */
export function formatDateLabel(dateStr, lang = 'en') {
  if (!dateStr) return '—';
  const parsed = new Date(`${dateStr}T00:00:00+05:30`);
  if (Number.isNaN(parsed.getTime())) return dateStr;

  return new Intl.DateTimeFormat(lang === 'gu' ? 'gu-IN' : 'en-IN', {
    timeZone: SALON_TIMEZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
}

/**
 * Formats an ISO timestamp as a short IST clock time.
 */
export function formatIsoTime(isoStr, lang = 'en') {
  if (!isoStr) return '—';
  const date = new Date(isoStr);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat(lang === 'gu' ? 'gu-IN' : 'en-IN', {
    timeZone: SALON_TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

/**
 * Formats live IST clock time with seconds option.
 */
export function formatLiveIstClock(now = new Date(), includeSeconds = false) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: SALON_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' } : {}),
    hour12: true,
  }).format(now);
}

/**
 * Formats duration in seconds as MM:SS for service timers and arrival windows.
 */
export function formatSecondsTimer(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return '00:00';
  }
  const whole = Math.floor(totalSeconds);
  const hours = Math.floor(whole / 3600);
  const mins = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;

  if (hours > 0) {
    return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Computes live elapsed & remaining seconds from started_at + totalDurationMinutes.
 */
export function computeLiveServiceTimer(startedAtIso, totalDurationMinutes, nowMs = Date.now()) {
  if (!startedAtIso || !Number.isFinite(totalDurationMinutes) || totalDurationMinutes <= 0) {
    return null;
  }
  const startedMs = Date.parse(startedAtIso);
  if (!Number.isFinite(startedMs)) {
    return null;
  }
  const elapsedSeconds = Math.max(0, Math.floor((nowMs - startedMs) / 1000));
  const totalSeconds = totalDurationMinutes * 60;
  const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);
  const overtimeSeconds = Math.max(0, elapsedSeconds - totalSeconds);

  return {
    elapsedSeconds,
    remainingSeconds,
    overtimeSeconds,
    progressPercent: Math.min(100, Math.round((elapsedSeconds / totalSeconds) * 100)),
  };
}

/**
 * Computes live remaining seconds for the 10-minute arrival window from called_at.
 */
export function computeLiveArrivalCountdown(calledAtIso, windowMinutes = 10, nowMs = Date.now()) {
  if (!calledAtIso) return null;
  const calledMs = Date.parse(calledAtIso);
  if (!Number.isFinite(calledMs)) return null;
  const deadlineMs = calledMs + windowMinutes * 60 * 1000;
  const remainingSeconds = Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));
  return {
    remainingSeconds,
    isExpired: remainingSeconds === 0,
  };
}

/**
 * Formats INR currency consistently.
 */
export function formatInr(amount) {
  const num = Number(amount);
  if (!Number.isFinite(num)) return '₹0';
  return `₹${num.toLocaleString('en-IN')}`;
}

/**
 * Formats minutes label concisely in English or Gujarati.
 */
export function formatMinutes(minutes, lang = 'en') {
  if (minutes === null || minutes === undefined || !Number.isFinite(Number(minutes))) {
    return '—';
  }
  const val = Math.max(0, Math.round(Number(minutes)));
  return lang === 'gu' ? `${val} મિનિટ` : `${val} min`;
}

/**
 * Extracts crisp 1–2 letter initials when a staff member has no avatar_url.
 */
export function getInitials(name) {
  if (typeof name !== 'string' || !name.trim()) return 'C';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 1).toUpperCase();
  }
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/**
 * Sanitizes phone number input to digits only (max 10).
 */
export function sanitizePhoneDigits(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 10);
}

/**
 * Validates exact 10-digit Indian customer phone input.
 */
export function isValidTenDigitPhone(value) {
  return /^[0-9]{10}$/.test(String(value || '').trim());
}

/**
 * Computes projected Any Available Stylist assignment preview matching backend workload rules.
 */
export function previewAnyAvailableStylist(staffList = [], selectedServiceIds = []) {
  if (!Array.isArray(staffList) || staffList.length === 0) {
    return { hasEligibleStaff: false, projectedStaff: null, estimatedWaitMinutes: null };
  }

  const eligible = staffList.filter((member) => {
    if (!member.is_on_duty || member.availability_status === 'On Break') {
      return false;
    }
    const qualSet = new Set(member.qualified_service_ids || []);
    return selectedServiceIds.every((id) => qualSet.has(id));
  });

  if (eligible.length === 0) {
    return { hasEligibleStaff: false, projectedStaff: null, estimatedWaitMinutes: null };
  }

  eligible.sort((a, b) => {
    const aWork = Number.isFinite(a.workload_minutes) ? a.workload_minutes : 99999;
    const bWork = Number.isFinite(b.workload_minutes) ? b.workload_minutes : 99999;
    if (aWork !== bWork) return aWork - bWork;

    const aSince = a.available_since ? Date.parse(a.available_since) : 0;
    const bSince = b.available_since ? Date.parse(b.available_since) : 0;
    if (aSince !== bSince) return aSince - bSince;

    return String(a.id).localeCompare(String(b.id));
  });

  const best = eligible[0];
  return {
    hasEligibleStaff: true,
    projectedStaff: best,
    estimatedWaitMinutes: best.workload_minutes ?? null,
  };
}

/**
 * Plays a gentle two-note salon chime using the Web Audio API (no external audio assets needed).
 */
export function playGentleSalonChime() {
  if (typeof window === 'undefined') return false;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return false;

  try {
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const playTone = (freq, startOffset, duration) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + startOffset);
      gain.gain.setValueAtTime(0.0001, now + startOffset);
      gain.gain.exponentialRampToValueAtTime(0.16, now + startOffset + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + duration + 0.05);
    };

    playTone(587.33, 0, 0.45); // D5
    playTone(880.0, 0.22, 0.75); // A5
    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 1500);
    return true;
  } catch {
    return false;
  }
}
