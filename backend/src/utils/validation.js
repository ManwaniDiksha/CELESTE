import crypto from 'node:crypto';
import net from 'node:net';
import { isVercelRuntime } from '../config/env.js';
import { MAX_PIN_LENGTH } from './pinCrypto.js';

const STAFF_SLUG_REGEX = /^[a-z0-9-]+$/;
const DATE_YYYY_MM_DD_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTION_REGEX = /^[a-z0-9_]{1,64}$/;
const TEN_DIGIT_PHONE_REGEX = /^[0-9]{10}$/;

const ALLOWED_REALTIME_KEYS = new Set(['queue_date', 'staff_id', 'action']);

export function isValidUuid(value) {
  return typeof value === 'string' && UUID_REGEX.test(value.trim());
}

export function isValidStaffSlug(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 64 && STAFF_SLUG_REGEX.test(value);
}

export function validatePinLoginBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }

  const { pin, scope, staffSlug } = body;

  if (typeof pin !== 'string' || pin.trim().length === 0 || pin.length > MAX_PIN_LENGTH) {
    return { ok: false, error: `PIN must be a non-empty string up to ${MAX_PIN_LENGTH} characters.` };
  }

  if (scope !== 'reception' && scope !== 'staff') {
    return { ok: false, error: 'scope must be either "reception" or "staff".' };
  }

  if (scope === 'reception') {
    if (staffSlug !== undefined && staffSlug !== null && staffSlug !== '') {
      return { ok: false, error: 'staffSlug must not be provided for reception login.' };
    }
    return { ok: true, value: { pin, scope: 'reception', staffSlug: null } };
  }

  if (typeof staffSlug !== 'string') {
    return { ok: false, error: 'staffSlug is required when scope is "staff".' };
  }

  const normalizedSlug = staffSlug.trim().toLowerCase();
  if (!isValidStaffSlug(normalizedSlug)) {
    return { ok: false, error: 'Invalid staffSlug format.' };
  }

  return { ok: true, value: { pin, scope: 'staff', staffSlug: normalizedSlug } };
}

/**
 * Validates customer online queue join request payloads.
 */
export function validateJoinQueueBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }

  const rawName = body.name;
  const rawPhone = body.phone;
  const rawServiceIds = body.serviceIds ?? body.service_ids;
  const selectionMode = body.selectionMode ?? body.selection_mode;
  const rawPreferredStaffId = body.preferredStaffId ?? body.preferred_staff_id;

  if (typeof rawName !== 'string' || rawName.trim().length === 0 || rawName.trim().length > 120) {
    return { ok: false, error: 'Customer name is required (1 to 120 characters).' };
  }

  if (typeof rawPhone !== 'string' || !TEN_DIGIT_PHONE_REGEX.test(rawPhone.trim())) {
    return { ok: false, error: 'Phone number must contain exactly 10 digits.' };
  }

  if (!Array.isArray(rawServiceIds) || rawServiceIds.length < 1 || rawServiceIds.length > 3) {
    return { ok: false, error: 'Please select between 1 and 3 services.' };
  }

  const normalizedServiceIds = [];
  const seenServices = new Set();
  for (const id of rawServiceIds) {
    if (!isValidUuid(id)) {
      return { ok: false, error: 'Each selected service must be a valid UUID.' };
    }
    const lowerId = id.trim().toLowerCase();
    if (seenServices.has(lowerId)) {
      return { ok: false, error: 'Duplicate services cannot be selected in the same entry.' };
    }
    seenServices.add(lowerId);
    normalizedServiceIds.push(lowerId);
  }

  if (selectionMode !== 'specific' && selectionMode !== 'any_available') {
    return { ok: false, error: 'selectionMode must be either "specific" or "any_available".' };
  }

  let preferredStaffId = null;
  if (selectionMode === 'specific') {
    if (!isValidUuid(rawPreferredStaffId)) {
      return { ok: false, error: 'preferredStaffId must be a valid UUID when selectionMode is "specific".' };
    }
    preferredStaffId = rawPreferredStaffId.trim().toLowerCase();
  } else if (rawPreferredStaffId !== undefined && rawPreferredStaffId !== null && rawPreferredStaffId !== '') {
    return { ok: false, error: 'preferredStaffId must not be provided when selectionMode is "any_available".' };
  }

  return {
    ok: true,
    value: {
      name: rawName.trim(),
      phone: rawPhone.trim(),
      serviceIds: normalizedServiceIds,
      selectionMode,
      preferredStaffId,
    },
  };
}

export function validateExplicitConfirmation(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || body.confirmed !== true) {
    return {
      ok: false,
      error: 'Explicit confirmation (confirmed: true) is required before cancelling a queue entry.',
    };
  }
  return { ok: true };
}

export function validateStaffAvailabilityBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }
  const status = body.status ?? body.availability_status;
  if (status !== 'Available' && status !== 'On Break') {
    return { ok: false, error: 'status must be either "Available" or "On Break".' };
  }
  return { ok: true, value: { status } };
}

export function validateStaffIdBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }
  const rawStaffId = body.staffId ?? body.staff_id;
  if (!isValidUuid(rawStaffId)) {
    return { ok: false, error: 'staffId must be a valid UUID.' };
  }
  return { ok: true, value: { staffId: rawStaffId.trim().toLowerCase() } };
}

const IMMUTABLE_CORRECTION_FIELDS = [
  'phone',
  'status',
  'tokenNumber',
  'token_number',
  'tokenDisplay',
  'token_display',
  'joinedAt',
  'joined_at',
  'queueDate',
  'queue_date',
  'assignedStaffId',
  'assigned_staff_id',
  'preferredStaffId',
  'preferred_staff_id',
  'actorRole',
  'actor_role',
];

export function validateCorrectQueueEntryBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }

  for (const field of IMMUTABLE_CORRECTION_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      return {
        ok: false,
        error: `Field "${field}" cannot be modified during queue entry correction.`,
      };
    }
  }

  const rawName = body.name ?? body.customerName ?? body.customer_name;
  const hasName = rawName !== undefined;
  let normalizedName = null;
  if (hasName) {
    if (typeof rawName !== 'string') {
      return { ok: false, error: 'Customer name must be a text string.' };
    }
    normalizedName = rawName.trim();
    if (normalizedName.length < 1 || normalizedName.length > 120) {
      return { ok: false, error: 'Customer name must be between 1 and 120 characters.' };
    }
  }

  const rawServiceIds = body.serviceIds ?? body.service_ids;
  const hasServices = rawServiceIds !== undefined;
  let normalizedServiceIds = null;
  if (hasServices) {
    if (!Array.isArray(rawServiceIds)) {
      return { ok: false, error: 'serviceIds must be an array of service UUIDs.' };
    }
    if (rawServiceIds.length < 1 || rawServiceIds.length > 3) {
      return { ok: false, error: 'Between 1 and 3 services must be selected.' };
    }
    const seen = new Set();
    normalizedServiceIds = [];
    for (const item of rawServiceIds) {
      if (!isValidUuid(item)) {
        return { ok: false, error: 'Each selected service must be a valid UUID.' };
      }
      const id = item.trim().toLowerCase();
      if (seen.has(id)) {
        return { ok: false, error: 'Duplicate services cannot be selected.' };
      }
      seen.add(id);
      normalizedServiceIds.push(id);
    }
  }

  if (!hasName && !hasServices) {
    return {
      ok: false,
      error: 'Provide at least a customer name or serviceIds to update.',
    };
  }

  return {
    ok: true,
    value: {
      name: normalizedName,
      serviceIds: normalizedServiceIds,
    },
  };
}

/**
 * Validates and strips Realtime broadcast payloads down to the 3 safe keys:
 * queue_date, staff_id, action. Rejects any unknown/PII keys.
 */
export function validateRealtimeBroadcastPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Realtime broadcast payload must be a plain object.');
  }

  for (const key of Object.keys(payload)) {
    if (!ALLOWED_REALTIME_KEYS.has(key)) {
      throw new Error(`Disallowed key "${key}" in Realtime broadcast payload.`);
    }
  }

  const { queue_date = null, staff_id = null, action } = payload;

  if (typeof action !== 'string' || !ACTION_REGEX.test(action)) {
    throw new Error('Realtime broadcast requires a safe lowercase action string.');
  }

  if (queue_date !== null && (typeof queue_date !== 'string' || !DATE_YYYY_MM_DD_REGEX.test(queue_date))) {
    throw new Error('Realtime broadcast queue_date must be null or YYYY-MM-DD.');
  }

  if (staff_id !== null && (typeof staff_id !== 'string' || !UUID_REGEX.test(staff_id))) {
    throw new Error('Realtime broadcast staff_id must be null or a valid UUID.');
  }

  return {
    queue_date,
    staff_id,
    action,
  };
}

function normalizeIpCandidate(rawValue) {
  if (!rawValue || typeof rawValue !== 'string') {
    return null;
  }

  let candidate = rawValue.trim();
  if (!candidate) {
    return null;
  }

  // Handle IPv4-mapped IPv6 addresses (e.g., ::ffff:127.0.0.1)
  if (candidate.toLowerCase().startsWith('::ffff:')) {
    const mapped = candidate.slice(7);
    if (net.isIP(mapped) === 4) {
      candidate = mapped;
    }
  }

  // Strip IPv6 zone index if present (e.g., fe80::1%lo0)
  const zoneIndex = candidate.indexOf('%');
  if (zoneIndex !== -1) {
    candidate = candidate.slice(0, zoneIndex);
  }

  if (net.isIP(candidate)) {
    return candidate.toLowerCase();
  }

  return null;
}

/**
 * Extracts client IP safely without blindly trusting arbitrary forwarding headers.
 * - On Vercel: prioritizes platform-controlled x-vercel-forwarded-for, then Express req.ip.
 * - Locally: uses req.socket.remoteAddress (ignores arbitrary client X-Forwarded-For).
 */
export function extractSafeClientIp(req) {
  if (isVercelRuntime()) {
    const vercelForwarded = req?.get?.('x-vercel-forwarded-for');
    if (vercelForwarded) {
      const firstToken = vercelForwarded.split(',')[0];
      const parsed = normalizeIpCandidate(firstToken);
      if (parsed) {
        return parsed;
      }
    }
    const trustIp = normalizeIpCandidate(req?.ip);
    if (trustIp) {
      return trustIp;
    }
  }

  const socketIp = normalizeIpCandidate(req?.socket?.remoteAddress || req?.ip);
  return socketIp || 'unknown';
}

/**
 * Derives a stable, irreversible, privacy-preserving key for rate limiting.
 * Uses HMAC-SHA256 keyed with PIN_SESSION_SECRET so raw IPs are never stored.
 */
export function getClientIpKey(req, sessionSecret) {
  if (!sessionSecret || typeof sessionSecret !== 'string') {
    throw new Error('PIN_SESSION_SECRET is required to derive privacy-preserving IP keys.');
  }

  const clientIp = extractSafeClientIp(req);
  const digest = crypto
    .createHmac('sha256', sessionSecret)
    .update(`pin-ip-v1:${clientIp}`)
    .digest('hex');

  return `ip_hmac_v1:${digest}`;
}

export function extractBearerToken(authorizationHeader) {
  if (!authorizationHeader || typeof authorizationHeader !== 'string') {
    return null;
  }

  const match = /^Bearer\s+(\S+)$/i.exec(authorizationHeader.trim());
  return match ? match[1] : null;
}

const VALID_SERVICE_CATEGORIES = new Set(['Hair', 'Beard & Grooming', 'Skin', 'Hands & Feet']);
const VALID_WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const HH_MM_24H_REGEX = /^([01][0-9]|2[0-3]):([0-5][0-9])$/;
const SERVICE_KEY_REGEX = /^[a-z0-9-]+$/;

export function isValidIsoDate(value) {
  if (typeof value !== 'string' || !DATE_YYYY_MM_DD_REGEX.test(value.trim())) {
    return false;
  }
  const [y, m, d] = value.trim().split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function normalizeUuidArray(rawList, fieldLabel) {
  if (!Array.isArray(rawList)) {
    return { ok: false, error: `${fieldLabel} must be an array of valid UUIDs.` };
  }
  const seen = new Set();
  const normalized = [];
  for (const item of rawList) {
    if (!isValidUuid(item)) {
      return { ok: false, error: `Each ID in ${fieldLabel} must be a valid UUID.` };
    }
    const id = item.trim().toLowerCase();
    if (!seen.has(id)) {
      seen.add(id);
      normalized.push(id);
    }
  }
  return { ok: true, value: normalized };
}

export function validateOwnerServiceBody(body, { partial = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }

  const out = {};

  if (!partial || body.category !== undefined) {
    const cat = typeof body.category === 'string' ? body.category.trim() : '';
    if (!VALID_SERVICE_CATEGORIES.has(cat)) {
      return { ok: false, error: 'Category must be Hair, Beard & Grooming, Skin, or Hands & Feet.' };
    }
    out.category = cat;
  }

  if (!partial || body.name_en !== undefined) {
    const nameEn = typeof body.name_en === 'string' ? body.name_en.trim() : '';
    if (nameEn.length < 1 || nameEn.length > 120) {
      return { ok: false, error: 'English service name must be between 1 and 120 characters.' };
    }
    out.name_en = nameEn;
  }

  if (!partial || body.name_gu !== undefined) {
    const nameGu = typeof body.name_gu === 'string' ? body.name_gu.trim() : '';
    if (nameGu.length < 1 || nameGu.length > 120) {
      return { ok: false, error: 'Gujarati service name must be between 1 and 120 characters.' };
    }
    out.name_gu = nameGu;
  }

  if (!partial || body.duration_minutes !== undefined) {
    const dur = Number(body.duration_minutes);
    if (!Number.isInteger(dur) || dur <= 0 || dur > 600) {
      return { ok: false, error: 'Duration must be a positive whole number of minutes (1–600).' };
    }
    out.duration_minutes = dur;
  }

  if (!partial || body.price_inr !== undefined) {
    const price = Number(body.price_inr);
    if (!Number.isInteger(price) || price < 0 || price > 500000) {
      return { ok: false, error: 'Price must be a non-negative whole INR amount.' };
    }
    out.price_inr = price;
  }

  if (body.is_active !== undefined) {
    if (typeof body.is_active !== 'boolean') {
      return { ok: false, error: 'is_active must be a boolean.' };
    }
    out.is_active = body.is_active;
  } else if (!partial) {
    out.is_active = true;
  }

  if (!partial && body.service_key !== undefined && body.service_key !== null && body.service_key !== '') {
    if (typeof body.service_key !== 'string' || !SERVICE_KEY_REGEX.test(body.service_key.trim().toLowerCase())) {
      return { ok: false, error: 'service_key may contain only lowercase letters, numbers, and hyphens.' };
    }
    out.service_key = body.service_key.trim().toLowerCase();
  }

  const rawStaffIds = body.staff_ids ?? body.staffIds;
  if (rawStaffIds !== undefined) {
    if (rawStaffIds === null && partial) {
      out.staff_ids = null;
    } else {
      const parsedIds = normalizeUuidArray(rawStaffIds, 'staff_ids');
      if (!parsedIds.ok) return parsedIds;
      out.staff_ids = parsedIds.value;
    }
  } else if (!partial) {
    out.staff_ids = [];
  }

  if (partial && Object.keys(out).length === 0) {
    return { ok: false, error: 'Provide at least one service field to update.' };
  }

  return { ok: true, value: out };
}

export function validateOwnerStaffProfileBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }

  const out = {};
  if (body.slug !== undefined) {
    if (typeof body.slug !== 'string' || !isValidStaffSlug(body.slug.trim().toLowerCase())) {
      return { ok: false, error: 'Staff slug must contain lowercase letters, numbers, or hyphens.' };
    }
    out.slug = body.slug.trim().toLowerCase();
  }

  for (const field of ['name_en', 'name_gu', 'role_en', 'role_gu', 'speciality_en', 'speciality_gu']) {
    if (body[field] !== undefined) {
      const text = typeof body[field] === 'string' ? body[field].trim() : '';
      if (text.length < 1 || text.length > 140) {
        return { ok: false, error: `${field} must be between 1 and 140 characters.` };
      }
      out[field] = text;
    }
  }

  if (Object.keys(out).length === 0) {
    return { ok: false, error: 'Provide at least one staff profile field to update.' };
  }

  return { ok: true, value: out };
}

export function validateOwnerStaffDutyBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }
  const flag = body.is_on_duty ?? body.isOnDuty;
  if (typeof flag !== 'boolean') {
    return { ok: false, error: 'is_on_duty must be a boolean.' };
  }
  return { ok: true, value: { is_on_duty: flag } };
}

export function validateOwnerQualificationsBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }
  const rawIds = body.service_ids ?? body.serviceIds;
  const parsed = normalizeUuidArray(rawIds, 'service_ids');
  if (!parsed.ok) return parsed;
  return { ok: true, value: { service_ids: parsed.value } };
}

export function validateOwnerToggleQualificationBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }
  const staffId = body.staff_id ?? body.staffId;
  const serviceId = body.service_id ?? body.serviceId;
  if (!isValidUuid(staffId) || !isValidUuid(serviceId)) {
    return { ok: false, error: 'Valid staff_id and service_id UUIDs are required.' };
  }
  if (typeof body.qualified !== 'boolean') {
    return { ok: false, error: 'qualified must be a boolean.' };
  }
  return {
    ok: true,
    value: {
      staff_id: staffId.trim().toLowerCase(),
      service_id: serviceId.trim().toLowerCase(),
      qualified: body.qualified,
    },
  };
}

export function validateOwnerSettingsBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }

  const out = {};

  if (body.operating_hours !== undefined) {
    const rawHours = body.operating_hours;
    if (!rawHours || typeof rawHours !== 'object' || Array.isArray(rawHours)) {
      return { ok: false, error: 'operating_hours must be an object keyed by mon..sun.' };
    }

    const normalizedHours = {};
    for (const day of VALID_WEEKDAYS) {
      if (!Object.prototype.hasOwnProperty.call(rawHours, day)) {
        return { ok: false, error: `operating_hours is missing weekday "${day}".` };
      }
      const val = rawHours[day];
      if (val === null) {
        normalizedHours[day] = null;
        continue;
      }
      if (!val || typeof val !== 'object' || Array.isArray(val)) {
        return { ok: false, error: `Schedule for "${day}" must be null (closed) or { open, close }.` };
      }
      const openStr = typeof val.open === 'string' ? val.open.trim() : '';
      const closeStr = typeof val.close === 'string' ? val.close.trim() : '';
      if (!HH_MM_24H_REGEX.test(openStr) || !HH_MM_24H_REGEX.test(closeStr)) {
        return { ok: false, error: `Times for "${day}" must use 24-hour HH:MM format.` };
      }
      if (openStr >= closeStr) {
        return { ok: false, error: `Closing time must be later than opening time for "${day}".` };
      }
      normalizedHours[day] = { open: openStr, close: closeStr };
    }
    out.operating_hours = normalizedHours;
  }

  if (body.is_online_queue_open !== undefined) {
    if (typeof body.is_online_queue_open !== 'boolean') {
      return { ok: false, error: 'is_online_queue_open must be a boolean.' };
    }
    out.is_online_queue_open = body.is_online_queue_open;
  }

  if (body.daily_online_capacity !== undefined) {
    const cap = Number(body.daily_online_capacity);
    if (!Number.isInteger(cap) || cap < 0 || cap > 500) {
      return { ok: false, error: 'daily_online_capacity must be an integer between 0 and 500.' };
    }
    out.daily_online_capacity = cap;
  }

  if (body.online_cutoff_minutes !== undefined) {
    const cutoff = Number(body.online_cutoff_minutes);
    if (!Number.isInteger(cutoff) || cutoff < 0 || cutoff > 360) {
      return { ok: false, error: 'online_cutoff_minutes must be an integer between 0 and 360.' };
    }
    out.online_cutoff_minutes = cutoff;
  }

  if (Object.keys(out).length === 0) {
    return { ok: false, error: 'Provide at least one salon setting to update.' };
  }

  return { ok: true, value: out };
}

export function validateDemoResetConfirmation(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || body.confirmed !== true) {
    return { ok: false, error: 'Explicit confirmation (confirmed: true) is required before resetting demo data.' };
  }
  const phrase = typeof body.confirmation_phrase === 'string' ? body.confirmation_phrase.trim().toUpperCase() : '';
  if (phrase !== 'RESET DEMO DATA') {
    return { ok: false, error: 'Type RESET DEMO DATA to confirm demo queue reset.' };
  }
  return { ok: true };
}

const APPOINTMENT_REF_REGEX = /^APT-[A-Z0-9-]{4,32}$/;

export function validateBookAppointmentBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }

  const rawName = body.name;
  const rawPhone = body.phone;
  const rawDate = body.appointmentDate ?? body.appointment_date;
  const rawTime = body.startTime ?? body.start_time;
  const rawServiceIds = body.serviceIds ?? body.service_ids;
  const selectionMode = body.selectionMode ?? body.selection_mode ?? 'any_available';
  const rawPreferredStaffId = body.preferredStaffId ?? body.preferred_staff_id;

  if (typeof rawName !== 'string' || rawName.trim().length === 0 || rawName.trim().length > 120) {
    return { ok: false, error: 'Customer name is required (1 to 120 characters).' };
  }

  if (typeof rawPhone !== 'string' || !TEN_DIGIT_PHONE_REGEX.test(rawPhone.trim())) {
    return { ok: false, error: 'Phone number must contain exactly 10 digits.' };
  }

  if (!isValidIsoDate(rawDate)) {
    return { ok: false, error: 'appointmentDate must use YYYY-MM-DD format.' };
  }

  const timeStr = typeof rawTime === 'string' ? rawTime.trim() : '';
  if (!HH_MM_24H_REGEX.test(timeStr)) {
    return { ok: false, error: 'startTime must use 24-hour HH:MM format.' };
  }

  if (!Array.isArray(rawServiceIds) || rawServiceIds.length < 1 || rawServiceIds.length > 3) {
    return { ok: false, error: 'Please select between 1 and 3 services.' };
  }

  const normalizedServiceIds = [];
  const seen = new Set();
  for (const id of rawServiceIds) {
    if (!isValidUuid(id)) {
      return { ok: false, error: 'Each selected service must be a valid UUID.' };
    }
    const lower = id.trim().toLowerCase();
    if (seen.has(lower)) {
      return { ok: false, error: 'Duplicate services cannot be selected.' };
    }
    seen.add(lower);
    normalizedServiceIds.push(lower);
  }

  if (selectionMode !== 'specific' && selectionMode !== 'any_available') {
    return { ok: false, error: 'selectionMode must be either "specific" or "any_available".' };
  }

  let preferredStaffId = null;
  if (selectionMode === 'specific') {
    if (!isValidUuid(rawPreferredStaffId)) {
      return { ok: false, error: 'preferredStaffId must be a valid UUID when selectionMode is "specific".' };
    }
    preferredStaffId = rawPreferredStaffId.trim().toLowerCase();
  }

  return {
    ok: true,
    value: {
      name: rawName.trim(),
      phone: rawPhone.trim(),
      appointmentDate: rawDate.trim(),
      startTime: timeStr,
      serviceIds: normalizedServiceIds,
      selectionMode,
      preferredStaffId,
    },
  };
}

export function validateAppointmentLookupQuery(query) {
  const reference = typeof query?.reference === 'string' ? query.reference.trim().toUpperCase() : '';
  const phone = typeof query?.phone === 'string' ? query.phone.trim() : '';

  if (!APPOINTMENT_REF_REGEX.test(reference)) {
    return { ok: false, error: 'Enter a valid appointment reference (e.g., APT-261126-A1B2).' };
  }
  if (!TEN_DIGIT_PHONE_REGEX.test(phone)) {
    return { ok: false, error: 'Phone number must contain exactly 10 digits.' };
  }

  return { ok: true, value: { referenceCode: reference, phone } };
}

export function validateDemoPinLoginBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }
  const { scope, staffSlug } = body;
  if (scope !== 'reception' && scope !== 'staff') {
    return { ok: false, error: 'scope must be either "reception" or "staff".' };
  }
  if (scope === 'reception') {
    return { ok: true, value: { scope: 'reception', staffSlug: null } };
  }
  if (typeof staffSlug !== 'string' || !isValidStaffSlug(staffSlug.trim().toLowerCase())) {
    return { ok: false, error: 'Valid staffSlug is required when scope is "staff".' };
  }
  return { ok: true, value: { scope: 'staff', staffSlug: staffSlug.trim().toLowerCase() } };
}
