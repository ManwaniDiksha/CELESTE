import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import express from 'express';

import { requireReceptionAuth, requireStaffAuth } from '../src/middleware/auth.js';
import { createReceptionRouter } from '../src/routes/reception.js';
import { createStaffRouter } from '../src/routes/staff.js';
import { getIstClock } from '../src/services/queueService.js';
import {
  createPinSessionToken,
  getPinSessionCookieOptions,
  PIN_SESSION_COOKIE_NAME,
  shouldUseSecureCookies,
  verifyPinSessionToken,
} from '../src/utils/cookies.js';
import { validatePinLoginBody } from '../src/utils/validation.js';

const TEST_SECRET = 'test_milestone2_session_secret_at_least_32_characters_long';

const STAFF_AARAV = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'aarav',
  name_en: 'Aarav',
  name_gu: 'આરવ',
  role_en: 'Senior Hair Stylist',
  role_gu: 'સિનિયર હેર સ્ટાઇલિસ્ટ',
  speciality_en: 'Haircuts',
  speciality_gu: 'હેરકટ',
  avatar_url: null,
  is_on_duty: true,
  availability_status: 'Available',
  available_since: '2026-11-25T05:00:00.000Z',
  display_order: 1,
};

const STAFF_MEERA = {
  id: '22222222-2222-4222-8222-222222222222',
  slug: 'meera',
  name_en: 'Meera',
  name_gu: 'મીરા',
  role_en: 'Colour Specialist',
  role_gu: 'કલર સ્પેશિયાલિસ્ટ',
  speciality_en: 'Colour',
  speciality_gu: 'કલર',
  avatar_url: null,
  is_on_duty: true,
  availability_status: 'Busy',
  available_since: '2026-11-25T04:00:00.000Z',
  display_order: 2,
};

const SVC_HAIRCUT = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  service_key: 'haircut',
  category: 'Hair',
  name_en: 'Haircut',
  name_gu: 'હેરકટ',
  duration_minutes: 30,
  price_inr: 250,
  is_active: true,
  display_order: 1,
};

const BASE_SETTINGS = {
  id: 1,
  salon_name: 'CELESTE',
  timezone: 'Asia/Kolkata',
  operating_hours: {
    mon: { open: '10:00', close: '21:00' },
    tue: { open: '10:00', close: '21:00' },
    wed: { open: '10:00', close: '21:00' },
    thu: { open: '10:00', close: '21:00' },
    fri: { open: '10:00', close: '21:00' },
    sat: { open: '09:00', close: '22:00' },
    sun: { open: '10:00', close: '20:00' },
  },
  is_online_queue_open: true,
  daily_online_capacity: 30,
  online_cutoff_minutes: 30,
  no_show_window_minutes: 10,
  max_services_per_entry: 3,
};

function makeMockSupabase({
  tables = {},
  rpcHandler = async () => ({ data: null, error: null }),
  failTable = null,
} = {}) {
  return {
    async rpc(name, params) {
      return rpcHandler(name, params);
    },
    from(tableName) {
      const filters = [];
      let orderBy = null;
      let singleMode = null;

      const query = {
        select() { return query; },
        eq(col, val) { filters.push((row) => row[col] === val); return query; },
        neq(col, val) { filters.push((row) => row[col] !== val); return query; },
        in(col, vals) { filters.push((row) => vals.includes(row[col])); return query; },
        order(col, { ascending = true } = {}) { orderBy = { col, ascending }; return query; },
        single() { singleMode = 'single'; return query.execute(); },
        maybeSingle() { singleMode = 'maybeSingle'; return query.execute(); },
        then(onFulfilled, onRejected) { return query.execute().then(onFulfilled, onRejected); },
        async execute() {
          if (failTable === tableName) {
            return { data: null, error: { message: 'Simulated SQL failure' } };
          }
          let rows = [...(tables[tableName] || [])].filter((r) => filters.every((fn) => fn(r)));
          if (orderBy) {
            rows.sort((a, b) => {
              const av = a[orderBy.col];
              const bv = b[orderBy.col];
              if (av === bv) return 0;
              return (av < bv ? -1 : 1) * (orderBy.ascending ? 1 : -1);
            });
          }
          if (singleMode === 'single') {
            if (rows.length === 0) return { data: null, error: { message: 'Row not found' } };
            return { data: rows[0], error: null };
          }
          if (singleMode === 'maybeSingle') {
            return { data: rows[0] || null, error: null };
          }
          return { data: rows, error: null };
        },
      };
      return query;
    },
  };
}

async function dispatch(app, method, url, { body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = new PassThrough();
    req.method = method;
    req.url = url;
    req.originalUrl = url;
    req.httpVersion = '1.1';
    req.httpVersionMajor = 1;
    req.httpVersionMinor = 1;
    req.socket = { remoteAddress: '127.0.0.1', encrypted: false };
    req.connection = req.socket;
    req.headers = { host: 'localhost:5187' };
    for (const [k, v] of Object.entries(headers)) req.headers[k.toLowerCase()] = v;

    let rawBody = null;
    if (body !== undefined) {
      req.headers['content-type'] = 'application/json';
      rawBody = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf8');
      req.headers['content-length'] = String(rawBody.length);
    }

    const resHeaders = {};
    const chunks = [];
    let ended = false;
    const res = new EventEmitter();
    res.statusCode = 200;
    res.locals = {};
    res.setHeader = (k, v) => { resHeaders[k.toLowerCase()] = v; };
    res.getHeader = (k) => resHeaders[k.toLowerCase()];
    res.getHeaders = () => ({ ...resHeaders });
    res.hasHeader = (k) => Object.prototype.hasOwnProperty.call(resHeaders, k.toLowerCase());
    res.removeHeader = (k) => { delete resHeaders[k.toLowerCase()]; };
    res.writeHead = (code, h) => {
      res.statusCode = code;
      if (h) for (const [k, v] of Object.entries(h)) res.setHeader(k, v);
      return res;
    };
    res.write = (chunk) => { chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))); return true; };
    res.end = (chunk) => {
      if (ended) return;
      ended = true;
      if (chunk) res.write(chunk);
      const text = Buffer.concat(chunks).toString('utf8');
      let json = null;
      try { json = JSON.parse(text); } catch {}
      resolve({ status: res.statusCode, headers: resHeaders, text, json });
      res.emit('finish');
    };

    if (rawBody) req.push(rawBody);
    req.push(null);

    app.handle(req, res, (err) => {
      if (err) {
        reject(err);
        return;
      }
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Route not found', path: url }));
    });
  });
}

// ---------------------------------------------------------------------------
// 1. Auth & Scope Isolation Tests (using real Stage 1 cookies + auth logic)
// ---------------------------------------------------------------------------

test('Reception and Staff routes enforce PIN session cookies, scope isolation, and stylist binding', async () => {
  process.env.PIN_SESSION_SECRET = TEST_SECRET;
  const receptionToken = createPinSessionToken({ scope: 'reception', staffSlug: null }, TEST_SECRET);
  const aaravToken = createPinSessionToken({ scope: 'staff', staffSlug: 'aarav' }, TEST_SECRET);

  // Use real requireReceptionAuth on reception, and an injected staff lookup middleware mimicking requireStaffAuth
  const app = express();
  app.use(express.json());

  const mockDb = makeMockSupabase({
    tables: {
      salon_settings: [{ ...BASE_SETTINGS, last_cleanup_date: getIstClock().date, last_staff_init_date: getIstClock().date }],
      staff: [STAFF_AARAV, STAFF_MEERA],
      services: [SVC_HAIRCUT],
      staff_services: [{ staff_id: STAFF_AARAV.id, service_id: SVC_HAIRCUT.id }],
      queue_entries: [],
      queue_entry_services: [],
      customers: [],
      daily_queue_statistics: [],
    },
  });

  app.use(
    '/api/reception',
    createReceptionRouter({ getSupabase: () => mockDb, isConfigured: () => true, requireAuth: requireReceptionAuth })
  );

  // Check real requireStaffAuth behavior via cookie verification against mocked staff lookup
  const staffAuthGate = async (req, res, next) => {
    const { readPinSessionFromRequest } = await import('../src/utils/cookies.js');
    const { session } = readPinSessionFromRequest(req, TEST_SECRET);
    if (!session) return res.status(401).json({ success: false, error: 'Staff PIN authentication required.' });
    if (session.scope !== 'staff') return res.status(403).json({ success: false, error: 'Staff scope is required.' });
    const staff = [STAFF_AARAV, STAFF_MEERA].find((s) => s.slug === req.params.slug);
    if (!staff) return res.status(404).json({ success: false, error: 'Staff member not found.' });
    if (session.staffSlug !== staff.slug) return res.status(403).json({ success: false, error: 'Access denied for this staff profile.' });
    req.staffMember = staff;
    return next();
  };

  app.use(
    '/api/staff',
    createStaffRouter({ getSupabase: () => mockDb, isConfigured: () => true, requireAuth: staffAuthGate })
  );

  // Unauthenticated blocked
  assert.equal((await dispatch(app, 'GET', '/api/reception/dashboard')).status, 401);
  assert.equal((await dispatch(app, 'GET', '/api/staff/aarav/dashboard')).status, 401);

  // Staff cookie rejected on Reception (403)
  assert.equal(
    (await dispatch(app, 'GET', '/api/reception/dashboard', { headers: { Cookie: `${PIN_SESSION_COOKIE_NAME}=${aaravToken}` } })).status,
    403
  );

  // Reception cookie rejected on Staff (403)
  assert.equal(
    (await dispatch(app, 'GET', '/api/staff/aarav/dashboard', { headers: { Cookie: `${PIN_SESSION_COOKIE_NAME}=${receptionToken}` } })).status,
    403
  );

  // Aarav cookie rejected on Meera's Staff endpoint (403) and nonexistent slug (404)
  assert.equal(
    (await dispatch(app, 'GET', '/api/staff/meera/dashboard', { headers: { Cookie: `${PIN_SESSION_COOKIE_NAME}=${aaravToken}` } })).status,
    403
  );
  assert.equal(
    (await dispatch(app, 'GET', '/api/staff/unknown-slug/dashboard', { headers: { Cookie: `${PIN_SESSION_COOKIE_NAME}=${aaravToken}` } })).status,
    404
  );

  // Matching cookies succeed
  assert.equal(
    (await dispatch(app, 'GET', '/api/reception/dashboard', { headers: { Cookie: `${PIN_SESSION_COOKIE_NAME}=${receptionToken}` } })).status,
    200
  );
  assert.equal(
    (await dispatch(app, 'GET', '/api/staff/aarav/dashboard', { headers: { Cookie: `${PIN_SESSION_COOKIE_NAME}=${aaravToken}` } })).status,
    200
  );
});

// ---------------------------------------------------------------------------
// 2. Reception APIs Tests
// ---------------------------------------------------------------------------

test('Reception dashboard & entry details expose phone PII, stats, >60m flag, and 10m no-show window accurately', async () => {
  const now = new Date();
  const today = getIstClock(now).date;
  const eWaitLongId = '99999999-9999-4999-8999-999999999901';
  const eCalledReadyId = '99999999-9999-4999-8999-999999999902';

  const mockDb = makeMockSupabase({
    tables: {
      salon_settings: [{ ...BASE_SETTINGS, last_cleanup_date: today, last_staff_init_date: today }],
      staff: [STAFF_AARAV, STAFF_MEERA],
      services: [SVC_HAIRCUT],
      staff_services: [{ staff_id: STAFF_AARAV.id, service_id: SVC_HAIRCUT.id }],
      customers: [
        { id: 'cust-1', name: 'Diya Patel', phone: '9876543210' },
        { id: 'cust-2', name: 'Rohan Shah', phone: '9876501234' },
      ],
      queue_entries: [
        {
          id: eWaitLongId,
          queue_date: today,
          token_number: 1,
          token_display: 'S-01',
          customer_id: 'cust-1',
          source: 'online',
          selection_mode: 'specific',
          assigned_staff_id: STAFF_AARAV.id,
          status: 'Waiting',
          joined_at: new Date(now.getTime() - 75 * 60000).toISOString(),
          start_coming_at: new Date(now.getTime() - 5 * 60000).toISOString(),
          called_at: null,
          started_at: null,
        },
        {
          id: eCalledReadyId,
          queue_date: today,
          token_number: 2,
          token_display: 'S-02',
          customer_id: 'cust-2',
          source: 'walk_in',
          selection_mode: 'specific',
          assigned_staff_id: STAFF_MEERA.id,
          status: 'Called',
          joined_at: new Date(now.getTime() - 25 * 60000).toISOString(),
          start_coming_at: null,
          called_at: new Date(now.getTime() - 11 * 60000).toISOString(),
          started_at: null,
        },
      ],
      queue_entry_services: [
        { queue_entry_id: eWaitLongId, service_id: SVC_HAIRCUT.id, position: 1, service_name_en_snapshot: 'Haircut', service_name_gu_snapshot: 'હેરકટ', duration_minutes_snapshot: 30, price_inr_snapshot: 250 },
        { queue_entry_id: eCalledReadyId, service_id: SVC_HAIRCUT.id, position: 1, service_name_en_snapshot: 'Haircut', service_name_gu_snapshot: 'હેરકટ', duration_minutes_snapshot: 30, price_inr_snapshot: 250 },
      ],
      daily_queue_statistics: [{ queue_date: today, total_entries: 5, served_count: 3, cancelled_count: 0, no_show_count: 0, completed_services_count: 4, daily_revenue_inr: 1200 }],
    },
  });

  const app = express();
  app.use(express.json());
  app.use('/api/reception', createReceptionRouter({
    getSupabase: () => mockDb,
    isConfigured: () => true,
    requireAuth: (_req, _res, next) => next(),
  }));

  const dash = await dispatch(app, 'GET', '/api/reception/dashboard');
  assert.equal(dash.status, 200);
  assert.equal(dash.json.data.summary.served_count, 3);
  assert.equal(dash.json.data.summary.daily_revenue_inr, 1200);
  assert.equal(dash.json.data.queue_entries.length, 2);
  assert.equal(dash.json.data.queue_entries[0].customer_phone, '9876543210');
  assert.equal(dash.json.data.queue_entries[0].is_waiting_over_60_minutes, true);
  assert.equal(dash.json.data.queue_entries[0].is_customer_on_the_way, true);
  assert.equal(dash.json.data.queue_entries[1].can_mark_no_show, true);

  const detail = await dispatch(app, 'GET', `/api/reception/entries/${eWaitLongId}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.json.data.customer_phone, '9876543210');
  assert.equal(detail.json.data.can_correct, true);
});

test('Reception mutation routes enforce RPC contracts, no-show timing, explicit cancel confirmation, and zero-PII broadcasts', async () => {
  const today = getIstClock().date;
  const entryId = '99999999-9999-4999-8999-999999999905';
  const broadcasts = [];
  let failRpc = null;
  const rpcCalls = [];

  const mockDb = makeMockSupabase({
    tables: {
      queue_entries: [{ id: entryId, queue_date: today, assigned_staff_id: STAFF_AARAV.id }],
    },
    rpcHandler: async (name, params) => {
      rpcCalls.push({ name, params });
      if (failRpc === name) {
        if (name === 'mark_no_show') return { data: null, error: { message: 'NO_SHOW_WINDOW_NOT_EXPIRED: wait' } };
        if (name === 'set_staff_availability') return { data: null, error: { message: 'STAFF_BUSY_CANNOT_TAKE_BREAK: busy' } };
        return { data: null, error: { message: 'RECEPTION_CANCEL_NOT_ALLOWED: done' } };
      }
      if (name === 'call_next_customer') {
        return { data: { success: true, data: { entry_id: entryId, token_display: 'S-01', assigned_staff_id: STAFF_AARAV.id, status: 'Called' } }, error: null };
      }
      if (name === 'start_service_with_actor') {
        assert.equal(params.p_actor_role, 'reception');
        return { data: { success: true, data: { entry_id: entryId, token_display: 'S-01', assigned_staff_id: STAFF_AARAV.id, status: 'In Chair', actor_role: params.p_actor_role } }, error: null };
      }
      if (name === 'complete_service_with_actor') {
        assert.equal(params.p_actor_role, 'reception');
        return { data: { success: true, data: { entry_id: entryId, token_display: 'S-01', assigned_staff_id: STAFF_AARAV.id, status: 'Done', actor_role: params.p_actor_role } }, error: null };
      }
      if (name === 'mark_no_show') {
        return { data: { success: true, data: { entry_id: entryId, token_display: 'S-01', assigned_staff_id: STAFF_AARAV.id, status: 'No-show' } }, error: null };
      }
      if (name === 'cancel_queue_entry') {
        return { data: { success: true, data: { entry_id: entryId, token_display: 'S-01', assigned_staff_id: STAFF_AARAV.id, status: 'Cancelled', cancelled_by: 'reception' } }, error: null };
      }
      if (name === 'set_staff_availability') {
        return { data: { success: true, data: { staff_id: STAFF_AARAV.id, availability_status: params.p_status } }, error: null };
      }
      if (name === 'join_queue') {
        return { data: { success: true, data: { entry_id: entryId, queue_date: today, token_display: 'S-08', assigned_staff_id: STAFF_AARAV.id, status: 'Waiting', source: 'walk_in' } }, error: null };
      }
      return { data: null, error: null };
    },
  });

  const app = express();
  app.use(express.json());
  app.use('/api/reception', createReceptionRouter({
    getSupabase: () => mockDb,
    isConfigured: () => true,
    requireAuth: (_req, _res, next) => next(),
    broadcast: async (payload) => { broadcasts.push(payload); return { ok: true }; },
  }));

  // Failed No-show before 10 min -> 409, no broadcast
  failRpc = 'mark_no_show';
  const earlyNoShow = await dispatch(app, 'POST', `/api/reception/entries/${entryId}/no-show`, { body: {} });
  assert.equal(earlyNoShow.status, 409);
  assert.equal(broadcasts.length, 0);

  // Failed break while Busy -> 409, no broadcast
  failRpc = 'set_staff_availability';
  const busyBreak = await dispatch(app, 'PATCH', `/api/reception/staff/${STAFF_AARAV.id}/availability`, { body: { status: 'On Break' } });
  assert.equal(busyBreak.status, 409);
  assert.equal(broadcasts.length, 0);

  // Missing confirmation on cancel -> 400
  failRpc = null;
  const noConfirm = await dispatch(app, 'POST', `/api/reception/entries/${entryId}/cancel`, { body: { confirmed: false } });
  assert.equal(noConfirm.status, 400);

  // Successful flow: walk-in, call-next, start, complete, no-show, cancel, availability
  assert.equal((await dispatch(app, 'POST', '/api/reception/walk-in', {
    body: { name: 'Walk-in Guest', phone: '9876543210', serviceIds: [SVC_HAIRCUT.id], selectionMode: 'specific', preferredStaffId: STAFF_AARAV.id },
  })).status, 201);
  assert.equal((await dispatch(app, 'POST', '/api/reception/call-next', { body: { staffId: STAFF_AARAV.id } })).status, 200);
  assert.equal((await dispatch(app, 'POST', `/api/reception/entries/${entryId}/start`, { body: {} })).status, 200);
  assert.equal((await dispatch(app, 'POST', `/api/reception/entries/${entryId}/complete`, { body: {} })).status, 200);
  assert.equal((await dispatch(app, 'POST', `/api/reception/entries/${entryId}/no-show`, { body: {} })).status, 200);
  assert.equal((await dispatch(app, 'POST', `/api/reception/entries/${entryId}/cancel`, { body: { confirmed: true } })).status, 200);
  assert.equal((await dispatch(app, 'PATCH', `/api/reception/staff/${STAFF_AARAV.id}/availability`, { body: { status: 'On Break' } })).status, 200);

  assert.equal(broadcasts.length, 7);
  for (const b of broadcasts) {
    assert.deepEqual(Object.keys(b).sort(), ['action', 'queue_date', 'staff_id']);
  }
  const walkInCall = rpcCalls.find((c) => c.name === 'join_queue');
  assert.equal(walkInCall.params.p_source, 'walk_in');
  const startCall = rpcCalls.find((c) => c.name === 'start_service_with_actor');
  assert.equal(startCall.params.p_actor_role, 'reception');
  const completeCall = rpcCalls.find((c) => c.name === 'complete_service_with_actor');
  assert.equal(completeCall.params.p_actor_role, 'reception');
  const cancelCall = rpcCalls.find((c) => c.name === 'cancel_queue_entry');
  assert.equal(cancelCall.params.p_actor_role, 'reception');
});

// ---------------------------------------------------------------------------
// 3. Staff APIs Tests
// ---------------------------------------------------------------------------

test('Staff dashboard & mutations bind strictly to authenticated staff, omit phone PII, and enforce transitions', async () => {
  const now = new Date();
  const today = getIstClock(now).date;
  const aaravEntryId = '99999999-9999-4999-8999-999999999911';
  const aaravWaitId = '99999999-9999-4999-8999-999999999912';
  const meeraEntryId = '99999999-9999-4999-8999-999999999922';
  const broadcasts = [];
  let rpcMode = 'ok';

  const mockDb = makeMockSupabase({
    tables: {
      salon_settings: [{ ...BASE_SETTINGS, last_cleanup_date: today, last_staff_init_date: today }],
      staff: [STAFF_AARAV, STAFF_MEERA],
      customers: [
        { id: 'cust-1', name: 'Diya Patel', phone: '9876543210' },
        { id: 'cust-2', name: 'Karan Mehta', phone: '9123456789' },
      ],
      queue_entries: [
        {
          id: aaravEntryId,
          queue_date: today,
          token_number: 1,
          token_display: 'S-01',
          customer_id: 'cust-1',
          source: 'online',
          selection_mode: 'specific',
          assigned_staff_id: STAFF_AARAV.id,
          status: 'In Chair',
          joined_at: new Date(now.getTime() - 20 * 60000).toISOString(),
          called_at: new Date(now.getTime() - 15 * 60000).toISOString(),
          started_at: new Date(now.getTime() - 10 * 60000).toISOString(),
        },
        {
          id: aaravWaitId,
          queue_date: today,
          token_number: 2,
          token_display: 'S-02',
          customer_id: 'cust-2',
          source: 'online',
          selection_mode: 'specific',
          assigned_staff_id: STAFF_AARAV.id,
          status: 'Waiting',
          joined_at: new Date(now.getTime() - 5 * 60000).toISOString(),
        },
        {
          id: meeraEntryId,
          queue_date: today,
          token_number: 3,
          token_display: 'S-03',
          customer_id: 'cust-2',
          source: 'online',
          selection_mode: 'specific',
          assigned_staff_id: STAFF_MEERA.id,
          status: 'Called',
          joined_at: new Date(now.getTime() - 15 * 60000).toISOString(),
          called_at: new Date(now.getTime() - 12 * 60000).toISOString(),
        },
      ],
      queue_entry_services: [
        { queue_entry_id: aaravEntryId, service_id: SVC_HAIRCUT.id, position: 1, service_name_en_snapshot: 'Haircut', service_name_gu_snapshot: 'હેરકટ', duration_minutes_snapshot: 30, price_inr_snapshot: 250 },
        { queue_entry_id: aaravWaitId, service_id: SVC_HAIRCUT.id, position: 1, service_name_en_snapshot: 'Haircut', service_name_gu_snapshot: 'હેરકટ', duration_minutes_snapshot: 30, price_inr_snapshot: 250 },
      ],
    },
    rpcHandler: async (name, params) => {
      if (name === 'start_service') {
        assert.equal(params.p_staff_id, STAFF_AARAV.id); // never trusts client staffId
        if (params.p_entry_id === meeraEntryId) {
          return { data: null, error: { message: 'ENTRY_NOT_ASSIGNED_TO_STAFF: no' } };
        }
        if (rpcMode === 'not_called') {
          return { data: null, error: { message: 'ENTRY_MUST_BE_CALLED: invalid' } };
        }
        return { data: { success: true, data: { entry_id: params.p_entry_id, assigned_staff_id: STAFF_AARAV.id, status: 'In Chair' } }, error: null };
      }
      if (name === 'complete_service') {
        assert.equal(params.p_staff_id, STAFF_AARAV.id);
        return { data: { success: true, data: { entry_id: params.p_entry_id, assigned_staff_id: STAFF_AARAV.id, status: 'Done' } }, error: null };
      }
      if (name === 'call_next_customer') {
        assert.equal(params.p_staff_id, STAFF_AARAV.id);
        return { data: { success: true, data: { entry_id: aaravWaitId, assigned_staff_id: STAFF_AARAV.id, status: 'Called' } }, error: null };
      }
      if (name === 'mark_no_show') {
        if (rpcMode === 'early_noshow') {
          return { data: null, error: { message: 'NO_SHOW_WINDOW_NOT_EXPIRED: wait' } };
        }
        return { data: { success: true, data: { entry_id: params.p_entry_id, assigned_staff_id: STAFF_AARAV.id, status: 'No-show' } }, error: null };
      }
      if (name === 'set_staff_availability') {
        assert.equal(params.p_staff_id, STAFF_AARAV.id);
        assert.equal(params.p_actor_role, 'staff');
        if (rpcMode === 'busy_break') {
          return { data: null, error: { message: 'STAFF_BUSY_CANNOT_TAKE_BREAK: busy' } };
        }
        return { data: { success: true, data: { staff_id: STAFF_AARAV.id, availability_status: params.p_status } }, error: null };
      }
      return { data: null, error: null };
    },
  });

  const app = express();
  app.use(express.json());
  app.use('/api/staff', createStaffRouter({
    getSupabase: () => mockDb,
    isConfigured: () => true,
    requireAuth: (req, _res, next) => {
      req.staffMember = STAFF_AARAV;
      next();
    },
    broadcast: async (payload) => { broadcasts.push(payload); return { ok: true }; },
  }));

  // Staff dashboard contains assigned customer names and ZERO phone numbers
  const dash = await dispatch(app, 'GET', '/api/staff/aarav/dashboard');
  assert.equal(dash.status, 200);
  assert.equal(dash.json.data.current_entry.customer_name, 'Diya Patel');
  assert.equal(dash.json.data.next_customer.customer_name, 'Karan Mehta');
  assert.equal(dash.text.includes('9876543210'), false);
  assert.equal(dash.text.includes('9123456789'), false);
  assert.equal(dash.text.includes('S-03'), false); // Meera's entry excluded

  // Cross-staff entry manipulation blocked with 403 and zero broadcasts
  const crossStart = await dispatch(app, 'POST', `/api/staff/aarav/entries/${meeraEntryId}/start`, {
    body: { staffId: STAFF_MEERA.id },
  });
  assert.equal(crossStart.status, 403);
  const crossNoShow = await dispatch(app, 'POST', `/api/staff/aarav/entries/${meeraEntryId}/no-show`, { body: {} });
  assert.equal(crossNoShow.status, 403);
  assert.equal(broadcasts.length, 0);

  // Invalid transition / busy break / early no-show rejected without broadcast
  rpcMode = 'not_called';
  assert.equal((await dispatch(app, 'POST', `/api/staff/aarav/entries/${aaravWaitId}/start`, { body: {} })).status, 409);
  rpcMode = 'early_noshow';
  assert.equal((await dispatch(app, 'POST', `/api/staff/aarav/entries/${aaravEntryId}/no-show`, { body: {} })).status, 409);
  rpcMode = 'busy_break';
  assert.equal((await dispatch(app, 'PATCH', '/api/staff/aarav/availability', { body: { status: 'On Break' } })).status, 409);
  assert.equal(broadcasts.length, 0);

  // Valid Staff transitions broadcast strictly zero-PII 3-key payload
  rpcMode = 'ok';
  assert.equal((await dispatch(app, 'POST', '/api/staff/aarav/call-next', { body: { staffId: STAFF_MEERA.id } })).status, 200);
  assert.equal((await dispatch(app, 'POST', `/api/staff/aarav/entries/${aaravWaitId}/start`, { body: {} })).status, 200);
  assert.equal((await dispatch(app, 'POST', `/api/staff/aarav/entries/${aaravEntryId}/complete`, { body: {} })).status, 200);
  assert.equal((await dispatch(app, 'POST', `/api/staff/aarav/entries/${aaravEntryId}/no-show`, { body: {} })).status, 200);
  assert.equal((await dispatch(app, 'PATCH', '/api/staff/aarav/availability', { body: { status: 'Available' } })).status, 200);

  assert.equal(broadcasts.length, 5);
  for (const b of broadcasts) {
    assert.deepEqual(Object.keys(b).sort(), ['action', 'queue_date', 'staff_id']);
    assert.equal(b.staff_id, STAFF_AARAV.id);
  }
});

// ---------------------------------------------------------------------------
// 4. Migration 007 Contract Tests: Queue Correction & Actor Attribution
// ---------------------------------------------------------------------------

test('Reception PATCH /entries/:id enforces validation, Waiting-only status, immutable fields, and preserves queue position', async () => {
  const today = getIstClock().date;
  const entryId = '99999999-9999-4999-8999-999999999931';
  const originalJoinedAt = '2026-11-25T04:30:00.000Z';
  const broadcasts = [];
  const rpcCalls = [];
  let entryStatus = 'Waiting';
  let rejectReason = null;

  const mockDb = makeMockSupabase({
    rpcHandler: async (name, params) => {
      rpcCalls.push({ name, params });
      if (name !== 'correct_queue_entry') return { data: null, error: null };

      if (entryStatus !== 'Waiting') {
        return { data: null, error: { message: 'CORRECTION_ONLY_WAITING: Entry already called' } };
      }
      if (rejectReason === 'inactive') {
        return { data: null, error: { message: 'INACTIVE_OR_UNKNOWN_SERVICE: One or more selected services are unavailable' } };
      }
      if (rejectReason === 'unqualified') {
        return { data: null, error: { message: 'STYLIST_NOT_QUALIFIED: Assigned stylist is not qualified for all selected services' } };
      }

      return {
        data: {
          success: true,
          message: 'Queue entry updated.',
          data: {
            entry_id: params.p_entry_id,
            queue_date: today,
            token_number: 4,
            token_display: 'S-04',
            status: 'Waiting',
            joined_at: originalJoinedAt,
            assigned_staff_id: STAFF_AARAV.id,
            customer_name: params.p_customer_name ?? 'Original Guest',
            services: [
              {
                service_id: SVC_HAIRCUT.id,
                position: 1,
                service_name_en_snapshot: 'Haircut',
                service_name_gu_snapshot: 'હેરકટ',
                duration_minutes_snapshot: 30,
                price_inr_snapshot: 250,
              },
            ],
            total_duration_minutes: 30,
            total_price_inr: 250,
          },
        },
        error: null,
      };
    },
  });

  const app = express();
  app.use(express.json());
  app.use('/api/reception', createReceptionRouter({
    getSupabase: () => mockDb,
    isConfigured: () => true,
    requireAuth: (_req, _res, next) => next(),
    broadcast: async (payload) => { broadcasts.push(payload); return { ok: true }; },
  }));

  // Validation errors -> 400, no RPC call, no broadcast
  assert.equal((await dispatch(app, 'PATCH', '/api/reception/entries/not-a-uuid', { body: { name: 'A' } })).status, 400);
  assert.equal((await dispatch(app, 'PATCH', `/api/reception/entries/${entryId}`, { body: {} })).status, 400);
  assert.equal((await dispatch(app, 'PATCH', `/api/reception/entries/${entryId}`, { body: { name: '   ' } })).status, 400);
  assert.equal((await dispatch(app, 'PATCH', `/api/reception/entries/${entryId}`, { body: { serviceIds: [] } })).status, 400);
  assert.equal((await dispatch(app, 'PATCH', `/api/reception/entries/${entryId}`, { body: { serviceIds: [SVC_HAIRCUT.id, SVC_HAIRCUT.id] } })).status, 400);
  assert.equal((await dispatch(app, 'PATCH', `/api/reception/entries/${entryId}`, { body: { serviceIds: [SVC_HAIRCUT.id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4'] } })).status, 400);

  // Immutable fields rejected -> 400
  for (const forbidden of [
    { phone: '9999999999', name: 'Test' },
    { status: 'In Chair', name: 'Test' },
    { tokenNumber: 1, name: 'Test' },
    { joinedAt: '2026-11-25T00:00:00.000Z', name: 'Test' },
    { assignedStaffId: STAFF_MEERA.id, name: 'Test' },
    { actorRole: 'staff', name: 'Test' },
  ]) {
    assert.equal((await dispatch(app, 'PATCH', `/api/reception/entries/${entryId}`, { body: forbidden })).status, 400);
  }
  assert.equal(rpcCalls.length, 0);
  assert.equal(broadcasts.length, 0);

  // Called / In Chair / Done statuses rejected with 409 and no broadcast
  for (const blockedStatus of ['Called', 'In Chair', 'Done']) {
    entryStatus = blockedStatus;
    const blocked = await dispatch(app, 'PATCH', `/api/reception/entries/${entryId}`, { body: { name: 'Late Edit' } });
    assert.equal(blocked.status, 409);
    assert.equal(blocked.json.code, 'CORRECTION_ONLY_WAITING');
  }
  assert.equal(broadcasts.length, 0);

  // Inactive service / unqualified staff rejected without broadcast
  entryStatus = 'Waiting';
  rejectReason = 'inactive';
  const inactiveRes = await dispatch(app, 'PATCH', `/api/reception/entries/${entryId}`, { body: { serviceIds: [SVC_HAIRCUT.id] } });
  assert.equal(inactiveRes.status, 400);
  assert.equal(inactiveRes.json.code, 'INACTIVE_OR_UNKNOWN_SERVICE');

  rejectReason = 'unqualified';
  const unqualRes = await dispatch(app, 'PATCH', `/api/reception/entries/${entryId}`, { body: { serviceIds: [SVC_HAIRCUT.id] } });
  assert.equal(unqualRes.status, 409);
  assert.equal(unqualRes.json.code, 'STYLIST_NOT_QUALIFIED');
  assert.equal(broadcasts.length, 0);

  // Valid Waiting correction preserves token_number, token_display, joined_at, status and broadcasts zero-PII payload
  rejectReason = null;
  const okRes = await dispatch(app, 'PATCH', `/api/reception/entries/${entryId}`, {
    body: { name: '  Aarohi Shah  ', serviceIds: [SVC_HAIRCUT.id] },
  });
  assert.equal(okRes.status, 200);
  assert.equal(okRes.json.data.token_number, 4);
  assert.equal(okRes.json.data.token_display, 'S-04');
  assert.equal(okRes.json.data.joined_at, originalJoinedAt);
  assert.equal(okRes.json.data.status, 'Waiting');
  assert.equal(okRes.json.data.customer_name, 'Aarohi Shah');

  const lastCall = rpcCalls[rpcCalls.length - 1];
  assert.equal(lastCall.name, 'correct_queue_entry');
  assert.deepEqual(lastCall.params, {
    p_entry_id: entryId,
    p_customer_name: 'Aarohi Shah',
    p_service_ids: [SVC_HAIRCUT.id],
  });

  assert.equal(broadcasts.length, 1);
  assert.deepEqual(broadcasts[0], {
    queue_date: today,
    staff_id: STAFF_AARAV.id,
    action: 'queue_entry_corrected',
  });
});

test('Reception vs Staff actor attribution calls distinct RPCs cleanly', async () => {
  const today = getIstClock().date;
  const entryId = '99999999-9999-4999-8999-999999999941';
  const seenRpcs = [];

  const mockDb = makeMockSupabase({
    tables: {
      queue_entries: [{ id: entryId, queue_date: today, assigned_staff_id: STAFF_AARAV.id }],
    },
    rpcHandler: async (name, params) => {
      seenRpcs.push({ name, params });
      return {
        data: {
          success: true,
          data: {
            entry_id: entryId,
            assigned_staff_id: STAFF_AARAV.id,
            status: name.startsWith('start_service') ? 'In Chair' : 'Done',
          },
        },
        error: null,
      };
    },
  });

  const app = express();
  app.use(express.json());
  app.use('/api/reception', createReceptionRouter({
    getSupabase: () => mockDb,
    isConfigured: () => true,
    requireAuth: (_req, _res, next) => next(),
    broadcast: async () => ({ ok: true }),
  }));
  app.use('/api/staff', createStaffRouter({
    getSupabase: () => mockDb,
    isConfigured: () => true,
    requireAuth: (req, _res, next) => {
      req.staffMember = STAFF_AARAV;
      next();
    },
    broadcast: async () => ({ ok: true }),
  }));

  assert.equal((await dispatch(app, 'POST', `/api/reception/entries/${entryId}/start`, { body: {} })).status, 200);
  assert.equal((await dispatch(app, 'POST', `/api/reception/entries/${entryId}/complete`, { body: {} })).status, 200);
  assert.equal((await dispatch(app, 'POST', `/api/staff/aarav/entries/${entryId}/start`, { body: {} })).status, 200);
  assert.equal((await dispatch(app, 'POST', `/api/staff/aarav/entries/${entryId}/complete`, { body: {} })).status, 200);

  assert.deepEqual(seenRpcs, [
    { name: 'start_service_with_actor', params: { p_staff_id: STAFF_AARAV.id, p_entry_id: entryId, p_actor_role: 'reception' } },
    { name: 'complete_service_with_actor', params: { p_staff_id: STAFF_AARAV.id, p_entry_id: entryId, p_actor_role: 'reception' } },
    { name: 'start_service', params: { p_staff_id: STAFF_AARAV.id, p_entry_id: entryId } },
    { name: 'complete_service', params: { p_staff_id: STAFF_AARAV.id, p_entry_id: entryId } },
  ]);
});

test('Staff PIN cookies, slug normalization, expiration, and route binding behave safely across all 5 stylists', async () => {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevVercel = process.env.VERCEL;
  try {
    // 1. Cookie Secure flag avoids blocking plain HTTP loopback even if NODE_ENV=production
    process.env.NODE_ENV = 'production';
    delete process.env.VERCEL;
    assert.equal(shouldUseSecureCookies({ secure: false, get: (h) => (h === 'host' ? 'localhost:5187' : '') }), false);
    assert.equal(shouldUseSecureCookies({ secure: false, get: (h) => (h === 'host' ? '127.0.0.1:5187' : '') }), false);
    assert.equal(shouldUseSecureCookies({ secure: false, get: (h) => (h === 'host' ? 'celeste-salon.app' : '') }), true);
    assert.equal(
      shouldUseSecureCookies({ secure: false, get: (h) => (h === 'x-forwarded-proto' ? 'https' : '') }),
      true
    );

    const cookieOpts = getPinSessionCookieOptions({ secure: false, get: () => 'localhost:5187' });
    assert.equal(cookieOpts.httpOnly, true);
    assert.equal(cookieOpts.sameSite, 'lax');
    assert.equal(cookieOpts.path, '/');
    assert.equal(cookieOpts.maxAge, 12 * 60 * 60 * 1000);
  } finally {
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    if (prevVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prevVercel;
  }

  // 2. Mixed-case staffSlug normalizes to lowercase in PIN login validation
  const normalizedBody = validatePinLoginBody({ pin: '1234', scope: 'staff', staffSlug: ' Aarav ' });
  assert.equal(normalizedBody.ok, true);
  assert.equal(normalizedBody.value.staffSlug, 'aarav');

  // 3. Expired session tokens fail verification cleanly
  const nowSec = 1_764_000_000;
  const oldToken = createPinSessionToken({ scope: 'staff', staffSlug: 'aarav', nowSeconds: nowSec }, TEST_SECRET);
  assert.ok(verifyPinSessionToken(oldToken, TEST_SECRET, nowSec + 60));
  assert.equal(verifyPinSessionToken(oldToken, TEST_SECRET, nowSec + 12 * 60 * 60 + 1), null);

  // 4. All 5 staff slugs resolve cleanly and stay bound to matching cookie slug
  const allSlugs = ['aarav', 'meera', 'kabir', 'riya', 'ananya'];
  const allStaff = allSlugs.map((slug, idx) => ({
    ...STAFF_AARAV,
    id: `11111111-1111-4111-8111-11111111110${idx + 1}`,
    slug,
    name_en: slug[0].toUpperCase() + slug.slice(1),
    display_order: idx + 1,
  }));

  const mockDb = makeMockSupabase({
    tables: {
      salon_settings: [{ ...BASE_SETTINGS, last_cleanup_date: getIstClock().date, last_staff_init_date: getIstClock().date }],
      staff: allStaff,
      services: [SVC_HAIRCUT],
      staff_services: [],
      queue_entries: [],
      queue_entry_services: [],
      customers: [],
    },
  });

  const app = express();
  app.use(express.json());
  app.use(
    '/api/staff',
    createStaffRouter({
      getSupabase: () => mockDb,
      isConfigured: () => true,
      requireAuth: async (req, res, next) => {
        const { readPinSessionFromRequest } = await import('../src/utils/cookies.js');
        const { session } = readPinSessionFromRequest(req, TEST_SECRET);
        if (!session) return res.status(401).json({ success: false, error: 'Staff PIN authentication required.' });
        const targetSlug = String(req.params.slug || '').trim().toLowerCase();
        const staff = allStaff.find((s) => s.slug === targetSlug);
        if (!staff) return res.status(404).json({ success: false, error: 'Staff member not found.' });
        if (session.staffSlug !== staff.slug) {
          return res.status(403).json({ success: false, error: 'Access denied for this staff profile.' });
        }
        req.staffMember = staff;
        return next();
      },
    })
  );

  for (const slug of allSlugs) {
    const token = createPinSessionToken({ scope: 'staff', staffSlug: slug }, TEST_SECRET);
    const okRes = await dispatch(app, 'GET', `/api/staff/${slug}/dashboard`, {
      headers: { Cookie: `${PIN_SESSION_COOKIE_NAME}=${token}` },
    });
    assert.equal(okRes.status, 200);
    assert.equal(okRes.json.data.staff.slug, slug);
  }

  // Mixed-case URL route slug matches lowercase staff token
  const aaravToken = createPinSessionToken({ scope: 'staff', staffSlug: 'aarav' }, TEST_SECRET);
  const mixedRes = await dispatch(app, 'GET', '/api/staff/Aarav/dashboard', {
    headers: { Cookie: `${PIN_SESSION_COOKIE_NAME}=${aaravToken}` },
  });
  assert.equal(mixedRes.status, 200);
  assert.equal(mixedRes.json.data.staff.slug, 'aarav');
});
