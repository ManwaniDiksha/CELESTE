import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import express from 'express';

import { createPublicRouter } from '../src/routes/public.js';
import { createQueueRouter } from '../src/routes/queue.js';
import {
  buildStaffQueueSnapshot,
  computeActiveServiceTiming,
  computeAnyAvailablePreview,
  computeTicketStatusMetrics,
  evaluateSalonOperatingStatus,
  getIstClock,
} from '../src/services/queueService.js';

const STAFF_1 = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'aarav',
  name_en: 'Aarav',
  name_gu: 'આરવ',
  role_en: 'Senior Hair Stylist',
  role_gu: 'સિનિયર હેર સ્ટાઇલિસ્ટ',
  speciality_en: 'Haircuts & styling',
  speciality_gu: 'હેરકટ અને સ્ટાઇલિંગ',
  avatar_url: null,
  is_on_duty: true,
  availability_status: 'Available',
  available_since: '2026-11-25T05:00:00.000Z',
  display_order: 1,
};

const STAFF_2 = {
  id: '22222222-2222-4222-8222-222222222222',
  slug: 'meera',
  name_en: 'Meera',
  name_gu: 'મીરા',
  role_en: 'Colour Specialist',
  role_gu: 'કલર સ્પેશિયાલિસ્ટ',
  speciality_en: 'Hair colour',
  speciality_gu: 'હેર કલર',
  avatar_url: null,
  is_on_duty: true,
  availability_status: 'Busy',
  available_since: '2026-11-25T04:00:00.000Z',
  display_order: 2,
};

const STAFF_3_BREAK = {
  id: '33333333-3333-4333-8333-333333333333',
  slug: 'kabir',
  name_en: 'Kabir',
  name_gu: 'કબીર',
  role_en: 'Barber Specialist',
  role_gu: 'બાર્બર સ્પેશિયાલિસ્ટ',
  speciality_en: 'Beard & grooming',
  speciality_gu: 'દાઢી અને ગ્રૂમિંગ',
  avatar_url: null,
  is_on_duty: true,
  availability_status: 'On Break',
  available_since: '2026-11-25T03:00:00.000Z',
  display_order: 3,
};

const SVC_1 = {
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

const SVC_2 = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  service_key: 'beard-trim',
  category: 'Beard & Grooming',
  name_en: 'Beard Trim',
  name_gu: 'દાઢી ટ્રિમ',
  duration_minutes: 15,
  price_inr: 120,
  is_active: true,
  display_order: 2,
};

const SVC_3_INACTIVE = {
  id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  service_key: 'retired-service',
  category: 'Skin',
  name_en: 'Retired',
  name_gu: 'નિવૃત્ત',
  duration_minutes: 45,
  price_inr: 500,
  is_active: false,
  display_order: 3,
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
  last_cleanup_date: '2026-11-25',
  last_staff_init_date: '2026-11-25',
};

function createTestApp(router, mountPath) {
  const app = express();
  app.use(express.json());
  app.use(mountPath, router);
  return app;
}

async function dispatch(app, method, url, body) {
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
      let wantCount = false;
      let headOnly = false;
      let singleMode = null;

      const query = {
        select(_cols, opts = {}) {
          if (opts.count === 'exact') wantCount = true;
          if (opts.head) headOnly = true;
          return query;
        },
        eq(col, val) {
          filters.push((row) => row[col] === val);
          return query;
        },
        neq(col, val) {
          filters.push((row) => row[col] !== val);
          return query;
        },
        in(col, vals) {
          filters.push((row) => vals.includes(row[col]));
          return query;
        },
        order(col, { ascending = true } = {}) {
          orderBy = { col, ascending };
          return query;
        },
        single() {
          singleMode = 'single';
          return query.execute();
        },
        maybeSingle() {
          singleMode = 'maybeSingle';
          return query.execute();
        },
        then(onFulfilled, onRejected) {
          return query.execute().then(onFulfilled, onRejected);
        },
        async execute() {
          if (failTable === tableName) {
            return { data: null, error: { message: 'Simulated database failure' } };
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
          return {
            data: headOnly ? null : rows,
            count: wantCount ? rows.length : undefined,
            error: null,
          };
        },
      };
      return query;
    },
  };
}

// ---------------------------------------------------------------------------
// 1. Queue Calculation Service Tests
// ---------------------------------------------------------------------------

test('getIstClock handles Asia/Kolkata date boundary across UTC midnight', () => {
  // 2026-11-25 18:40:00 UTC === 2026-11-26 00:10:00 IST
  const clock = getIstClock(new Date('2026-11-25T18:40:00.000Z'));
  assert.equal(clock.date, '2026-11-26');
  assert.equal(clock.timeHhMm, '00:10');
  assert.equal(clock.dayKey, 'thu');
});

test('evaluateSalonOperatingStatus enforces opening, cutoff, capacity and closed rules', () => {
  // Wed 2026-11-25 15:00 IST (09:30 UTC) -> open (10:00..21:00)
  const openRes = evaluateSalonOperatingStatus(BASE_SETTINGS, 5, new Date('2026-11-25T09:30:00.000Z'));
  assert.equal(openRes.is_salon_open, true);
  assert.equal(openRes.can_join_online, true);
  assert.equal(openRes.remaining_online_slots, 25);

  // Wed 2026-11-25 20:35 IST (15:05 UTC) -> open for walk-in, past 30-min online cutoff
  const cutoffRes = evaluateSalonOperatingStatus(BASE_SETTINGS, 5, new Date('2026-11-25T15:05:00.000Z'));
  assert.equal(cutoffRes.is_salon_open, true);
  assert.equal(cutoffRes.can_join_online, false);
  assert.equal(cutoffRes.online_blocked_reason, 'ONLINE_CUTOFF_PASSED');

  // Wed 2026-11-25 21:00 IST (15:30 UTC) -> closing time is exclusive
  const closedRes = evaluateSalonOperatingStatus(BASE_SETTINGS, 5, new Date('2026-11-25T15:30:00.000Z'));
  assert.equal(closedRes.is_salon_open, false);
  assert.equal(closedRes.is_past_closing_time, true);
  assert.equal(closedRes.online_blocked_reason, 'SALON_CLOSED');
});

test('buildStaffQueueSnapshot & computeTicketStatusMetrics handle empty, multi-waiting, FCFS, active timer, and terminal exclusions', () => {
  const now = new Date('2026-11-25T10:00:00.000Z');
  const today = getIstClock(now).date;

  // Empty queue
  const emptySnap = buildStaffQueueSnapshot([STAFF_1, STAFF_2], [], new Map(), now);
  assert.equal(emptySnap.get(STAFF_1.id).waitingEntries.length, 0);
  assert.equal(emptySnap.get(STAFF_1.id).workloadMinutesExact, 0);

  // One In Chair (started 10m ago, 30m duration -> 20m remaining) + three Waiting + terminal entries excluded
  const eInChair = {
    id: 'e-inchair',
    queue_date: today,
    token_number: 1,
    token_display: 'S-01',
    assigned_staff_id: STAFF_2.id,
    status: 'In Chair',
    joined_at: '2026-11-25T09:30:00.000Z',
    started_at: '2026-11-25T09:50:00.000Z',
  };
  const eWait1 = {
    id: 'e-wait-1',
    queue_date: today,
    token_number: 3,
    token_display: 'S-03',
    assigned_staff_id: STAFF_2.id,
    status: 'Waiting',
    joined_at: '2026-11-25T09:40:00.000Z',
  };
  const eWait2 = {
    id: 'e-wait-2',
    queue_date: today,
    token_number: 2,
    token_display: 'S-02',
    assigned_staff_id: STAFF_2.id,
    status: 'Waiting',
    joined_at: '2026-11-25T09:35:00.000Z', // joined earlier than eWait1 -> must rank 1st by FCFS
    start_coming_at: null,
  };
  const eDone = {
    id: 'e-done',
    queue_date: today,
    token_number: 4,
    token_display: 'S-04',
    assigned_staff_id: STAFF_2.id,
    status: 'Done',
    joined_at: '2026-11-25T09:00:00.000Z',
  };

  const svcMap = new Map([
    ['e-inchair', [{ position: 1, duration_minutes_snapshot: 30, price_inr_snapshot: 250 }]],
    ['e-wait-2', [{ position: 1, duration_minutes_snapshot: 15, price_inr_snapshot: 120 }]],
    ['e-wait-1', [{ position: 1, duration_minutes_snapshot: 30, price_inr_snapshot: 250 }]],
    ['e-done', [{ position: 1, duration_minutes_snapshot: 60, price_inr_snapshot: 700 }]],
  ]);

  const snap = buildStaffQueueSnapshot([STAFF_1, STAFF_2, STAFF_3_BREAK], [eInChair, eWait1, eWait2, eDone], svcMap, now);
  const staff2Bucket = snap.get(STAFF_2.id);

  assert.equal(staff2Bucket.waitingEntries.length, 2);
  assert.equal(staff2Bucket.waitingEntries[0].id, 'e-wait-2'); // earlier joined_at
  assert.equal(staff2Bucket.waitingEntries[1].id, 'e-wait-1'); // position 2
  // Workload: 20m remaining In Chair + 15m + 30m = 65m (eDone 60m excluded)
  assert.equal(Math.round(staff2Bucket.workloadMinutesExact), 65);

  const mWait1 = computeTicketStatusMetrics(eWait2, today, staff2Bucket, 10, now);
  assert.equal(mWait1.queue_position, 1);
  assert.equal(mWait1.customers_ahead, 0);
  assert.equal(mWait1.estimated_wait_minutes, 20);
  assert.equal(mWait1.can_start_coming, false);
  assert.equal(mWait1.can_cancel, true);

  const mWait2 = computeTicketStatusMetrics(eWait1, today, staff2Bucket, 10, now);
  assert.equal(mWait2.queue_position, 2);
  assert.equal(mWait2.customers_ahead, 1);
  assert.equal(mWait2.estimated_wait_minutes, 35); // 20m remaining + 15m eWait2
  assert.equal(mWait2.can_start_coming, true);

  // Terminal or past date ticket returns null queue metrics
  const mDone = computeTicketStatusMetrics(eDone, today, staff2Bucket, 10, now);
  assert.equal(mDone.queue_position, null);
  assert.equal(mDone.can_cancel, false);

  // Any Available Stylist preview respects qualification & On Break exclusion
  const preview = computeAnyAvailablePreview(snap, [STAFF_2.id, STAFF_3_BREAK.id], now);
  assert.equal(preview.has_eligible_staff, true);
  assert.equal(preview.projected_staff_id, STAFF_2.id); // STAFF_3_BREAK excluded
  assert.equal(preview.estimated_wait_minutes, 65);
});

test('computeActiveServiceTiming handles missing or invalid started_at safely without inventing values', () => {
  const timingMissing = computeActiveServiceTiming({ status: 'In Chair', started_at: null }, 30, new Date());
  assert.equal(timingMissing.elapsed_seconds, null);
  assert.equal(timingMissing.remaining_minutes, null);

  const timingInvalid = computeActiveServiceTiming({ status: 'In Chair', started_at: 'not-a-date' }, 30, new Date());
  assert.equal(timingInvalid.elapsed_seconds, null);
  assert.equal(timingInvalid.remaining_minutes, null);
});

// ---------------------------------------------------------------------------
// 2. Public Routes Tests
// ---------------------------------------------------------------------------

test('GET /api/public/home, /join-options, and /display enforce zero-PII, active filtering, and 5-token limit', async () => {
  const today = getIstClock().date;
  const waitingEntries = Array.from({ length: 7 }, (_, i) => ({
    id: `entry-wait-${i + 1}`,
    queue_date: today,
    token_number: i + 1,
    token_display: `S-0${i + 1}`,
    customer_id: `cust-${i + 1}`,
    source: 'online',
    selection_mode: 'specific',
    assigned_staff_id: STAFF_1.id,
    status: 'Waiting',
    joined_at: new Date(Date.now() - (10 - i) * 60000).toISOString(),
    called_at: null,
    started_at: null,
  }));

  const qesRows = waitingEntries.map((e) => ({
    queue_entry_id: e.id,
    service_id: SVC_1.id,
    position: 1,
    duration_minutes_snapshot: 10,
    price_inr_snapshot: 250,
  }));

  const mockDb = makeMockSupabase({
    tables: {
      salon_settings: [{ ...BASE_SETTINGS, last_cleanup_date: today, last_staff_init_date: today }],
      staff: [STAFF_1, STAFF_2, STAFF_3_BREAK],
      services: [SVC_1, SVC_2, SVC_3_INACTIVE],
      staff_services: [
        { staff_id: STAFF_1.id, service_id: SVC_1.id },
        { staff_id: STAFF_2.id, service_id: SVC_1.id },
        { staff_id: STAFF_3_BREAK.id, service_id: SVC_2.id },
      ],
      queue_entries: waitingEntries,
      queue_entry_services: qesRows,
      customers: [{ id: 'cust-1', name: 'Secret Customer', phone: '9876543210' }],
    },
  });

  const app = createTestApp(
    createPublicRouter({ getSupabase: () => mockDb, isConfigured: () => true }),
    '/api/public'
  );

  // Home
  const homeRes = await dispatch(app, 'GET', '/api/public/home');
  assert.equal(homeRes.status, 200);
  assert.equal(homeRes.json.success, true);
  assert.equal(homeRes.json.data.queue_summary.waiting_count, 7);
  assert.equal(homeRes.json.data.staff.length, 3);
  assert.equal(homeRes.text.includes('9876543210'), false);
  assert.equal(homeRes.text.includes('Secret Customer'), false);

  // Join options: inactive service excluded
  const joinRes = await dispatch(app, 'GET', '/api/public/join-options');
  assert.equal(joinRes.status, 200);
  assert.equal(joinRes.json.data.services.length, 2);
  assert.equal(joinRes.json.data.services.some((s) => s.id === SVC_3_INACTIVE.id), false);
  assert.deepEqual(joinRes.json.data.services[0].qualified_staff_ids, [STAFF_1.id, STAFF_2.id]);

  // Display: strictly 5 next waiting tokens, zero customer PII or entry UUIDs
  const displayRes = await dispatch(app, 'GET', '/api/public/display');
  assert.equal(displayRes.status, 200);
  assert.equal(displayRes.json.data.next_waiting_tokens.length, 5);
  assert.equal(displayRes.json.data.total_waiting_count, 7);
  assert.equal(displayRes.text.includes('entry-wait-1'), false);
  assert.equal(displayRes.text.includes('cust-1'), false);
  assert.equal(displayRes.text.includes('Secret Customer'), false);
  assert.equal(displayRes.text.includes('9876543210'), false);
});

test('Public routes handle Supabase failures safely without leaking internals', async () => {
  const failingDb = makeMockSupabase({ failTable: 'salon_settings' });
  const app = createTestApp(
    createPublicRouter({ getSupabase: () => failingDb, isConfigured: () => true }),
    '/api/public'
  );
  const res = await dispatch(app, 'GET', '/api/public/home');
  assert.equal(res.status, 503);
  assert.equal(res.json.success, false);
  assert.equal(res.text.includes('Simulated database failure'), false);
});

// ---------------------------------------------------------------------------
// 3. Customer Queue Routes Tests
// ---------------------------------------------------------------------------

test('POST /api/queue/join validates input, maps RPC failures without broadcast, and broadcasts zero-PII on success', async () => {
  const broadcasts = [];
  let rpcBehavior = 'success';
  const capturedCalls = [];

  const mockDb = makeMockSupabase({
    rpcHandler: async (name, params) => {
      capturedCalls.push({ name, params });
      if (rpcBehavior === 'inactive') return { data: null, error: { message: 'INACTIVE_OR_UNKNOWN_SERVICE: bad' } };
      if (rpcBehavior === 'unqualified') return { data: null, error: { message: 'STYLIST_NOT_QUALIFIED: no' } };
      if (rpcBehavior === 'closed') return { data: null, error: { message: 'ONLINE_QUEUE_CLOSED: closed' } };
      if (rpcBehavior === 'capacity') return { data: null, error: { message: 'ONLINE_CAPACITY_FULL: full' } };
      if (rpcBehavior === 'cutoff') return { data: null, error: { message: 'ONLINE_CUTOFF_PASSED: late' } };
      return {
        data: {
          success: true,
          data: {
            entry_id: '99999999-9999-4999-8999-999999999999',
            queue_date: '2026-11-25',
            token_number: 12,
            token_display: 'S-12',
            assigned_staff_id: STAFF_1.id,
            status: 'Waiting',
            source: 'online',
            selection_mode: 'specific',
            joined_at: '2026-11-25T10:00:00.000Z',
            total_duration_minutes: 30,
            total_price_inr: 250,
          },
          message: 'Joined the queue with token S-12.',
        },
        error: null,
      };
    },
  });

  const app = createTestApp(
    createQueueRouter({
      getSupabase: () => mockDb,
      isConfigured: () => true,
      broadcast: async (payload) => {
        broadcasts.push(payload);
        return { ok: true };
      },
    }),
    '/api/queue'
  );

  // Invalid phone
  const badPhone = await dispatch(app, 'POST', '/api/queue/join', {
    name: 'Diya',
    phone: '12345',
    serviceIds: [SVC_1.id],
    selectionMode: 'any_available',
  });
  assert.equal(badPhone.status, 400);
  assert.equal(capturedCalls.length, 0);

  // > 3 services
  const fourSvcs = await dispatch(app, 'POST', '/api/queue/join', {
    name: 'Diya',
    phone: '9876543210',
    serviceIds: [
      SVC_1.id,
      SVC_2.id,
      SVC_3_INACTIVE.id,
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    ],
    selectionMode: 'any_available',
  });
  assert.equal(fourSvcs.status, 400);

  // Duplicate services
  const dupSvcs = await dispatch(app, 'POST', '/api/queue/join', {
    name: 'Diya',
    phone: '9876543210',
    serviceIds: [SVC_1.id, SVC_1.id],
    selectionMode: 'any_available',
  });
  assert.equal(dupSvcs.status, 400);

  // RPC failure cases must not trigger Realtime broadcast
  for (const [mode, expectedStatus] of [
    ['inactive', 400],
    ['unqualified', 409],
    ['closed', 409],
    ['capacity', 409],
    ['cutoff', 409],
  ]) {
    rpcBehavior = mode;
    const failRes = await dispatch(app, 'POST', '/api/queue/join', {
      name: 'Diya',
      phone: '9876543210',
      serviceIds: [SVC_1.id],
      selectionMode: 'specific',
      preferredStaffId: STAFF_1.id,
    });
    assert.equal(failRes.status, expectedStatus);
    assert.equal(broadcasts.length, 0);
  }

  // Valid join -> 201 + exact RPC args + zero-PII broadcast
  rpcBehavior = 'success';
  const okRes = await dispatch(app, 'POST', '/api/queue/join', {
    name: 'Diya',
    phone: '9876543210',
    serviceIds: [SVC_1.id],
    selectionMode: 'specific',
    preferredStaffId: STAFF_1.id,
  });
  assert.equal(okRes.status, 201);
  assert.equal(okRes.json.data.token_display, 'S-12');
  assert.equal(okRes.text.includes('9876543210'), false);
  assert.deepEqual(broadcasts[0], {
    queue_date: '2026-11-25',
    staff_id: STAFF_1.id,
    action: 'queue_joined',
  });
});

test('GET /api/queue/status/:id validates UUID, handles missing ticket, and omits customer phone', async () => {
  const today = getIstClock().date;
  const ticketId = '99999999-9999-4999-8999-999999999999';
  const mockDb = makeMockSupabase({
    tables: {
      salon_settings: [BASE_SETTINGS],
      customers: [{ id: 'cust-1', name: 'Diya Patel', phone: '9876543210' }],
      staff: [STAFF_1],
      queue_entries: [
        {
          id: ticketId,
          queue_date: today,
          token_number: 5,
          token_display: 'S-05',
          customer_id: 'cust-1',
          source: 'online',
          selection_mode: 'specific',
          assigned_staff_id: STAFF_1.id,
          status: 'Waiting',
          joined_at: new Date().toISOString(),
          start_coming_at: null,
          called_at: null,
          started_at: null,
          completed_at: null,
          cancelled_at: null,
          cancelled_by: null,
          no_show_at: null,
        },
      ],
      queue_entry_services: [
        {
          queue_entry_id: ticketId,
          service_id: SVC_1.id,
          position: 1,
          service_name_en_snapshot: 'Haircut',
          service_name_gu_snapshot: 'હેરકટ',
          duration_minutes_snapshot: 30,
          price_inr_snapshot: 250,
        },
      ],
    },
  });

  const app = createTestApp(
    createQueueRouter({ getSupabase: () => mockDb, isConfigured: () => true }),
    '/api/queue'
  );

  const badUuid = await dispatch(app, 'GET', '/api/queue/status/not-a-uuid');
  assert.equal(badUuid.status, 400);

  const missing = await dispatch(app, 'GET', '/api/queue/status/88888888-8888-4888-8888-888888888888');
  assert.equal(missing.status, 404);

  const ok = await dispatch(app, 'GET', `/api/queue/status/${ticketId}`);
  assert.equal(ok.status, 200);
  assert.equal(ok.json.data.token_display, 'S-05');
  assert.equal(ok.json.data.customer_name, 'Diya Patel');
  assert.equal(ok.text.includes('9876543210'), false);
  assert.equal('phone' in ok.json.data, false);
});

test('POST /api/queue/:id/start-coming and /cancel enforce rules, actor role, confirmation, and broadcast safety', async () => {
  const broadcasts = [];
  let mode = 'pos2_ok';
  const cancelCalls = [];

  const ticketId = '77777777-7777-4777-8777-777777777777';
  const mockDb = makeMockSupabase({
    tables: {
      queue_entries: [{ id: ticketId, queue_date: '2026-11-25' }],
    },
    rpcHandler: async (name, params) => {
      if (name === 'acknowledge_start_coming') {
        if (mode === 'not_pos2') {
          return { data: null, error: { message: 'START_COMING_POSITION_INVALID: pos 3' } };
        }
        return {
          data: {
            success: true,
            data: {
              entry_id: ticketId,
              token_display: 'S-07',
              assigned_staff_id: STAFF_1.id,
              status: 'Waiting',
              queue_position: 2,
              start_coming_at: '2026-11-25T10:15:00.000Z',
            },
            message: 'Customer on the way acknowledgement recorded.',
          },
          error: null,
        };
      }
      if (name === 'cancel_queue_entry') {
        cancelCalls.push(params);
        if (mode === 'not_waiting') {
          return { data: null, error: { message: 'CUSTOMER_CANCEL_ONLY_WAITING: Called' } };
        }
        return {
          data: {
            success: true,
            data: {
              entry_id: ticketId,
              token_display: 'S-07',
              assigned_staff_id: STAFF_1.id,
              status: 'Cancelled',
              cancelled_at: '2026-11-25T10:20:00.000Z',
              cancelled_by: 'customer',
            },
            message: 'Token S-07 cancelled.',
          },
          error: null,
        };
      }
      return { data: null, error: null };
    },
  });

  const app = createTestApp(
    createQueueRouter({
      getSupabase: () => mockDb,
      isConfigured: () => true,
      broadcast: async (payload) => {
        broadcasts.push(payload);
        return { ok: false, reason: 'simulated_broadcast_error' }; // must NOT break HTTP 200
      },
    }),
    '/api/queue'
  );

  // Start coming blocked at wrong position
  mode = 'not_pos2';
  const badPos = await dispatch(app, 'POST', `/api/queue/${ticketId}/start-coming`, {});
  assert.equal(badPos.status, 409);
  assert.equal(broadcasts.length, 0);

  // Start coming succeeds at position 2 (even when broadcast returns ok: false)
  mode = 'pos2_ok';
  const okStart = await dispatch(app, 'POST', `/api/queue/${ticketId}/start-coming`, {});
  assert.equal(okStart.status, 200);
  assert.equal(broadcasts.length, 1);
  assert.equal(broadcasts[0].action, 'start_coming_acknowledged');

  // Cancel requires explicit confirmation
  const noConfirm = await dispatch(app, 'POST', `/api/queue/${ticketId}/cancel`, { confirmed: false });
  assert.equal(noConfirm.status, 400);

  // Cancel when not Waiting fails with 409 and no broadcast
  mode = 'not_waiting';
  const badStateCancel = await dispatch(app, 'POST', `/api/queue/${ticketId}/cancel`, { confirmed: true });
  assert.equal(badStateCancel.status, 409);
  assert.equal(broadcasts.length, 1);

  // Valid Waiting cancellation forces p_actor_role='customer' regardless of body.actorRole
  mode = 'ok';
  const okCancel = await dispatch(app, 'POST', `/api/queue/${ticketId}/cancel`, {
    confirmed: true,
    actorRole: 'reception',
  });
  assert.equal(okCancel.status, 200);
  assert.equal(cancelCalls[cancelCalls.length - 1].p_actor_role, 'customer');
  assert.equal(broadcasts.length, 2);
  assert.deepEqual(broadcasts[1], {
    queue_date: '2026-11-25',
    staff_id: STAFF_1.id,
    action: 'queue_cancelled',
  });
});
