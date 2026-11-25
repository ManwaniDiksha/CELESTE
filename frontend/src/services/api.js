// Reads the configurable API base URL from Vite environment variables.
// When unset or empty, requests use relative paths (e.g., /api/health),
// which work with the Vite dev proxy locally and Vercel rewrites in production.
const rawBaseUrl = import.meta.env?.VITE_API_BASE_URL || '';
const configuredBaseUrl = rawBaseUrl.replace(/\/+$/, '');
export const API_BASE_URL = configuredBaseUrl;

function resolveApiBaseUrl() {
  if (!configuredBaseUrl) {
    return '';
  }

  if (
    import.meta.env?.DEV &&
    typeof window !== 'undefined' &&
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(configuredBaseUrl)
  ) {
    try {
      const targetUrl = new URL(configuredBaseUrl);
      const pageHost = window.location.hostname;
      if (
        (pageHost === 'localhost' || pageHost === '127.0.0.1') &&
        targetUrl.hostname !== pageHost
      ) {
        return '';
      }
    } catch {
      return configuredBaseUrl;
    }
  }

  return configuredBaseUrl;
}

function normalizeHeaders(headersInit) {
  if (!headersInit) {
    return {};
  }

  if (typeof Headers !== 'undefined' && headersInit instanceof Headers) {
    return Object.fromEntries(headersInit.entries());
  }

  if (Array.isArray(headersInit)) {
    return Object.fromEntries(headersInit);
  }

  return { ...headersInit };
}

/**
 * Performs an API request against the configured backend base URL,
 * preserving default JSON headers and sending credentials (cookies).
 */
export async function apiRequest(path, options = {}) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${resolveApiBaseUrl()}${normalizedPath}`;

  const {
    headers: customHeaders,
    credentials: _ignoredCredentials,
    body,
    ...restOptions
  } = options;

  const callerHeaders = normalizeHeaders(customHeaders);
  const hasExplicitContentType = Object.keys(callerHeaders).some(
    (key) => key.toLowerCase() === 'content-type'
  );
  const isFormDataBody = typeof FormData !== 'undefined' && body instanceof FormData;

  const mergedHeaders = {
    ...(!hasExplicitContentType && !isFormDataBody
      ? { 'Content-Type': 'application/json' }
      : {}),
    ...callerHeaders,
  };

  const response = await fetch(url, {
    ...restOptions,
    credentials: 'include',
    headers: mergedHeaders,
    ...(body !== undefined ? { body } : {}),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(
      data.error || data.message || `Request failed with status ${response.status}`
    );
    error.status = response.status;
    error.code = data.code || null;
    error.data = data;
    throw error;
  }

  return data;
}

export function fetchHealthStatus() {
  return apiRequest('/api/health');
}

// ---------------------------------------------------------------------------
// Public & Customer Queue APIs
// ---------------------------------------------------------------------------

export function getHomeSummary() {
  return apiRequest('/api/public/home');
}

export function getJoinOptions() {
  return apiRequest('/api/public/join-options');
}

export function getDisplayBoard() {
  return apiRequest('/api/public/display');
}

export function joinQueue(payload) {
  return apiRequest('/api/queue/join', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getTicketStatus(entryId) {
  return apiRequest(`/api/queue/status/${encodeURIComponent(entryId)}`);
}

export function acknowledgeStartComing(entryId) {
  return apiRequest(`/api/queue/${encodeURIComponent(entryId)}/start-coming`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function cancelCustomerQueue(entryId) {
  return apiRequest(`/api/queue/${encodeURIComponent(entryId)}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ confirmed: true }),
  });
}

// ---------------------------------------------------------------------------
// Authentication APIs
// ---------------------------------------------------------------------------

export function getPinSession() {
  return apiRequest('/api/auth/pin/session');
}

export function loginWithPin({ pin, scope, staffSlug = null }) {
  return apiRequest('/api/auth/pin/login', {
    method: 'POST',
    body: JSON.stringify({
      pin,
      scope,
      ...(staffSlug ? { staffSlug } : {}),
    }),
  });
}

export function logoutPinSession() {
  return apiRequest('/api/auth/pin/logout', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function getOwnerSession(accessToken) {
  return apiRequest('/api/auth/owner/session', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

// ---------------------------------------------------------------------------
// Reception APIs
// ---------------------------------------------------------------------------

export function getReceptionDashboard() {
  return apiRequest('/api/reception/dashboard');
}

export function getReceptionEntryDetails(entryId) {
  return apiRequest(`/api/reception/entries/${encodeURIComponent(entryId)}`);
}

export function addWalkInCustomer(payload) {
  return apiRequest('/api/reception/walk-in', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function callNextByReception(staffId) {
  return apiRequest('/api/reception/call-next', {
    method: 'POST',
    body: JSON.stringify({ staffId }),
  });
}

export function startServiceByReception(entryId) {
  return apiRequest(`/api/reception/entries/${encodeURIComponent(entryId)}/start`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function completeServiceByReception(entryId) {
  return apiRequest(`/api/reception/entries/${encodeURIComponent(entryId)}/complete`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function markNoShowByReception(entryId) {
  return apiRequest(`/api/reception/entries/${encodeURIComponent(entryId)}/no-show`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function cancelEntryByReception(entryId) {
  return apiRequest(`/api/reception/entries/${encodeURIComponent(entryId)}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ confirmed: true }),
  });
}

export function correctEntryByReception(entryId, payload) {
  return apiRequest(`/api/reception/entries/${encodeURIComponent(entryId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function updateStaffAvailabilityByReception(staffId, status) {
  return apiRequest(`/api/reception/staff/${encodeURIComponent(staffId)}/availability`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

// ---------------------------------------------------------------------------
// Staff APIs
// ---------------------------------------------------------------------------

export function getStaffDashboard(slug) {
  return apiRequest(`/api/staff/${encodeURIComponent(slug)}/dashboard`);
}

export function callNextByStaff(slug) {
  return apiRequest(`/api/staff/${encodeURIComponent(slug)}/call-next`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function startServiceByStaff(slug, entryId) {
  return apiRequest(`/api/staff/${encodeURIComponent(slug)}/entries/${encodeURIComponent(entryId)}/start`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function completeServiceByStaff(slug, entryId) {
  return apiRequest(`/api/staff/${encodeURIComponent(slug)}/entries/${encodeURIComponent(entryId)}/complete`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function markNoShowByStaff(slug, entryId) {
  return apiRequest(`/api/staff/${encodeURIComponent(slug)}/entries/${encodeURIComponent(entryId)}/no-show`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function updateStaffAvailabilityBySelf(slug, status) {
  return apiRequest(`/api/staff/${encodeURIComponent(slug)}/availability`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

// ---------------------------------------------------------------------------
// Owner APIs (Supabase Auth Bearer token with app_metadata.role === 'owner')
// ---------------------------------------------------------------------------

function ownerAuthHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

export function getOwnerDashboard(accessToken, date = null) {
  const query = date ? `?date=${encodeURIComponent(date)}` : '';
  return apiRequest(`/api/owner/dashboard${query}`, {
    headers: ownerAuthHeaders(accessToken),
  });
}

export function getOwnerReports(accessToken, { date = null, limit = 30 } = {}) {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (limit) params.set('limit', String(limit));
  const qs = params.toString() ? `?${params.toString()}` : '';
  return apiRequest(`/api/owner/reports${qs}`, {
    headers: ownerAuthHeaders(accessToken),
  });
}

export function createOwnerService(accessToken, payload) {
  return apiRequest('/api/owner/services', {
    method: 'POST',
    headers: ownerAuthHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export function updateOwnerService(accessToken, serviceId, payload) {
  return apiRequest(`/api/owner/services/${encodeURIComponent(serviceId)}`, {
    method: 'PATCH',
    headers: ownerAuthHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export function updateOwnerStaffProfile(accessToken, staffId, payload) {
  return apiRequest(`/api/owner/staff/${encodeURIComponent(staffId)}/profile`, {
    method: 'PATCH',
    headers: ownerAuthHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export function updateOwnerStaffDuty(accessToken, staffId, isOnDuty) {
  return apiRequest(`/api/owner/staff/${encodeURIComponent(staffId)}/duty`, {
    method: 'PATCH',
    headers: ownerAuthHeaders(accessToken),
    body: JSON.stringify({ is_on_duty: isOnDuty }),
  });
}

export function updateOwnerStaffAvailability(accessToken, staffId, status) {
  return apiRequest(`/api/owner/staff/${encodeURIComponent(staffId)}/availability`, {
    method: 'PATCH',
    headers: ownerAuthHeaders(accessToken),
    body: JSON.stringify({ status }),
  });
}

export function setOwnerStaffQualifications(accessToken, staffId, serviceIds) {
  return apiRequest(`/api/owner/staff/${encodeURIComponent(staffId)}/qualifications`, {
    method: 'PUT',
    headers: ownerAuthHeaders(accessToken),
    body: JSON.stringify({ service_ids: serviceIds }),
  });
}

export function toggleOwnerQualification(accessToken, payload) {
  return apiRequest('/api/owner/qualifications/toggle', {
    method: 'POST',
    headers: ownerAuthHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export function updateOwnerSettings(accessToken, payload) {
  return apiRequest('/api/owner/settings', {
    method: 'PATCH',
    headers: ownerAuthHeaders(accessToken),
    body: JSON.stringify(payload),
  });
}

export function resetOwnerDemoData(accessToken, confirmationPhrase) {
  return apiRequest('/api/owner/demo-reset', {
    method: 'POST',
    headers: ownerAuthHeaders(accessToken),
    body: JSON.stringify({
      confirmed: true,
      confirmation_phrase: confirmationPhrase,
    }),
  });
}

// ---------------------------------------------------------------------------
// Future Appointments APIs
// ---------------------------------------------------------------------------

export function getAppointmentSlots({ date, serviceIds = [], preferredStaffId = null }) {
  const params = new URLSearchParams();
  params.set('date', date);
  params.set('serviceIds', serviceIds.join(','));
  if (preferredStaffId) params.set('preferredStaffId', preferredStaffId);
  return apiRequest(`/api/appointments/slots?${params.toString()}`);
}

export function bookAppointment(payload) {
  return apiRequest('/api/appointments/book', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function lookupAppointment({ reference, phone }) {
  const params = new URLSearchParams();
  params.set('reference', reference);
  params.set('phone', phone);
  return apiRequest(`/api/appointments/lookup?${params.toString()}`);
}

export function cancelCustomerAppointment(appointmentId, phone) {
  return apiRequest(`/api/appointments/${encodeURIComponent(appointmentId)}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ confirmed: true, phone }),
  });
}

export function getReceptionAppointments() {
  return apiRequest('/api/reception/appointments');
}

export function checkInAppointmentByReception(appointmentId) {
  return apiRequest(`/api/reception/appointments/${encodeURIComponent(appointmentId)}/check-in`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function cancelAppointmentByReception(appointmentId) {
  return apiRequest(`/api/reception/appointments/${encodeURIComponent(appointmentId)}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ confirmed: true }),
  });
}

export function markAppointmentNoShowByReception(appointmentId) {
  return apiRequest(`/api/reception/appointments/${encodeURIComponent(appointmentId)}/no-show`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function getOwnerAppointments(accessToken) {
  return apiRequest('/api/owner/appointments', {
    headers: ownerAuthHeaders(accessToken),
  });
}

export function cancelAppointmentByOwner(accessToken, appointmentId) {
  return apiRequest(`/api/owner/appointments/${encodeURIComponent(appointmentId)}/cancel`, {
    method: 'POST',
    headers: ownerAuthHeaders(accessToken),
    body: JSON.stringify({ confirmed: true }),
  });
}

// ---------------------------------------------------------------------------
// Demo Access APIs (Explicitly enabled in evaluation environments only)
// ---------------------------------------------------------------------------

export function getDemoConfig() {
  return apiRequest('/api/auth/demo-config');
}

export function getDemoPrefill() {
  return apiRequest('/api/auth/demo-prefill');
}

export function loginDemoPin({ scope, staffSlug = null, pin = null }) {
  return apiRequest('/api/auth/demo/pin-login', {
    method: 'POST',
    body: JSON.stringify({
      scope,
      ...(staffSlug ? { staffSlug } : {}),
      ...(pin ? { pin } : {}),
    }),
  });
}

export function loginDemoOwner() {
  return apiRequest('/api/auth/demo/owner-login', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}
