import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import express from 'express';
import { createAppointmentsRouter } from '../src/routes/appointments.js';
import { createReceptionRouter } from '../src/routes/reception.js';
import { createOwnerRouter } from '../src/routes/owner.js';
import authRouter from '../src/routes/auth.js';
import { hashPin } from '../src/utils/pinCrypto.js';

const SVC_1 = '11111111-1111-4111-8111-111111111111';
const SVC_2 = '22222222-2222-4222-8222-222222222222';
const STAFF_1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STAFF_2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const APPT_1 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CUST_1 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function buildMockSupabase({ existingAppointments = [], staffList = null } = {}) {
  const staff = staffList || [
    { id: STAFF_1, slug: 'aarav', name_en: 'Aarav', name_gu: 'આરવ', display_order: 1 },
    { id: STAFF_2, slug: 'meera', name_en: 'Meera', name_gu: 'મીરા', display_order: 2 },
  ];
  const tables = {
    salon_settings: [
      {
        id: 1,
        operating_hours: {
          mon: { open: '10:00', close: '21:00' },
          tue: { open: '10:00', close: '21:00' },
          wed: { open: '10:00', close: '21:00' },
          thu: { open: '10:00', close: '21:00' },
          fri: { open: '10:00', close: '21:00' },
          sat: { open: '09:00', close: '22:00' },
          sun: null,
        },
      },
    ],
    services: [
      { id: SVC_1, duration_minutes: 30, price_inr: 500, is_active: true },
      { id: SVC_2, duration_minutes: 60, price_inr: 1200, is_active: true },
    ],
    staff,
    staff_services: [
      { staff_id: STAFF_1, service_id: SVC_1 },
      { staff_id: STAFF_2, service_id: SVC_1 },
      { staff_id: STAFF_2, service_id: SVC_2 },
    ],
    appointments: existingAppointments,
    appointment_services: [
      {
        appointment_id: APPT_1,
        service_id: SVC_1,
        position: 1,
        service_name_en_snapshot: 'Haircut',
        service_name_gu_snapshot: 'હેરકટ',
        duration_minutes_snapshot: 30,
        price_inr_snapshot: 500,
      },
    ],
    customers: [{ id: CUST_1, name: 'Test Guest', phone: '9876543210' }],
    queue_entries: [],
  };

  return {
    from(table) {
      const filters = [];
      let isSingle = false;
      const chain = {
        select() { return chain; },
        eq(col, val) { filters.push((r) => r[col] === val); return chain; },
        in(col, vals) { const s = new Set(vals); filters.push((r) => s.has(r[col])); return chain; },
        gte(col, val) { filters.push((r) => r[col] >= val); return chain; },
        order() { return chain; },
        single() { isSingle = true; return chain; },
        maybeSingle() { isSingle = true; return chain; },
        then(resolve) {
          let rows = [...(tables[table] || [])];
          for (const fn of filters) rows = rows.filter(fn);
          if (isSingle) return resolve({ data: rows[0] || null, error: null });
          return resolve({ data: rows, error: null });
        },
      };
      return chain;
    },
    async rpc(name, args) {
      if (name === 'book_appointment') {
        if (args.p_appointment_date < '2026-11-25') {
          return { data: null, error: { message: 'PAST_APPOINTMENT_DATE: Cannot book in the past.' } };
        }
        if (args.p_start_time === '11:00' && args.p_preferred_staff_id === STAFF_1) {
          return { data: null, error: { message: 'SLOT_UNAVAILABLE: Selected stylist already has an appointment.' } };
        }
        return {
          data: {
            success: true,
            data: {
              appointment_id: APPT_1,
              reference_code: 'APT-261127-ABCD',
              appointment_date: args.p_appointment_date,
              start_time: args.p_start_time,
              end_time: '10:30',
              assigned_staff_id: args.p_preferred_staff_id || STAFF_2,
              status: 'Booked',
              total_duration_minutes: 30,
              total_price_inr: 500,
            },
          },
          error: null,
        };
      }
      if (name === 'cancel_appointment') {
        return {
          data: {
            success: true,
            data: {
              appointment_id: args.p_appointment_id,
              reference_code: 'APT-261127-ABCD',
              appointment_date: '2026-11-27',
              assigned_staff_id: STAFF_2,
              status: 'Cancelled',
            },
          },
          error: null,
        };
      }
      if (name === 'check_in_appointment') {
        if (args.p_appointment_id === 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee') {
          return { data: null, error: { message: 'APPOINTMENT_ALREADY_CHECKED_IN: Already checked in.' } };
        }
        return {
          data: {
            success: true,
            data: {
              appointment_id: args.p_appointment_id,
              reference_code: 'APT-261126-ABCD',
              entry_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
              token_number: 5,
              token_display: 'S-05',
              assigned_staff_id: STAFF_2,
              queue_date: '2026-11-26',
            },
          },
          error: null,
        };
      }
      if (name === 'mark_appointment_no_show') {
        return {
          data: {
            success: true,
            data: {
              appointment_id: args.p_appointment_id,
              reference_code: 'APT-261126-ABCD',
              appointment_date: '2026-11-26',
              assigned_staff_id: STAFF_2,
              status: 'No Show',
            },
          },
          error: null,
        };
      }
      return { data: null, error: { message: 'UNKNOWN_RPC' } };
    },
  };
}

function invokeApp(app, method, url, { body = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = new PassThrough();
    req.method = method;
    req.url = url;
    req.originalUrl = url;
    req.headers = { ...headers };
    if (body !== null) {
      req.headers['content-type'] = 'application/json';
      const payload = JSON.stringify(body);
      req.headers['content-length'] = String(Buffer.byteLength(payload));
      req.end(payload);
    } else {
      req.end();
    }
    const sock = new PassThrough();
    sock.remoteAddress = '127.0.0.1';
    req.socket = sock;
    req.connection = req.socket;

    const res = new EventEmitter();
    res.statusCode = 200;
    const outHeaders = {};
    res.setHeader = (k, v) => { outHeaders[k.toLowerCase()] = v; };
    res.getHeader = (k) => outHeaders[k.toLowerCase()];
    res.removeHeader = (k) => { delete outHeaders[k.toLowerCase()]; };
    res.getHeaders = () => outHeaders;
    const chunks = [];
    res.write = (c) => { chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c))); return true; };
    res.end = (c) => {
      if (c) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c)));
      const text = Buffer.concat(chunks).toString('utf8');
      let json = null;
      try { json = JSON.parse(text); } catch {}
      resolve({ status: res.statusCode, headers: outHeaders, json, text });
    };
    app.handle(req, res, (err) => (err ? reject(err) : resolve({ status: 404, headers: outHeaders, json: null, text: '' })));
  });
}

test('Appointment slots, booking while closed, overlap rejection, lookup & cancel work', async () => {
  const broadcasts = [];
  const existingAppts = [
    {
      id: APPT_1,
      reference_code: 'APT-261127-ABCD',
      appointment_date: '2026-11-27', // Friday (open 10:00-21:00)
      start_time: '11:00:00',
      end_time: '11:30:00',
      customer_id: CUST_1,
      selection_mode: 'specific',
      assigned_staff_id: STAFF_1,
      status: 'Booked',
      total_duration_minutes: 30,
      total_price_inr: 500,
      queue_entry_id: null,
    },
  ];
  const mockDb = buildMockSupabase({ existingAppointments: existingAppts });

  const app = express();
  app.use(express.json());
  app.use(
    '/api/appointments',
    createAppointmentsRouter({
      getSupabase: () => mockDb,
      isConfigured: () => true,
      broadcast: async (p) => broadcasts.push(p),
    })
  );

  // 1. Future Friday slots exclude 11:00 for STAFF_1
  const slotsRes = await invokeApp(app, 'GET', `/api/appointments/slots?date=2026-11-27&serviceIds=${SVC_1}&preferredStaffId=${STAFF_1}`);
  assert.equal(slotsRes.status, 200);
  assert.equal(slotsRes.json.data.is_closed, false);
  assert.equal(slotsRes.json.data.slots.some((s) => s.start_time === '11:00'), false);
  assert.equal(slotsRes.json.data.slots.some((s) => s.start_time === '10:00'), true);

  // 2. Sunday (2026-11-29) is closed -> returns is_closed: true, slots: []
  const sunRes = await invokeApp(app, 'GET', `/api/appointments/slots?date=2026-11-29&serviceIds=${SVC_1}`);
  assert.equal(sunRes.json.data.is_closed, true);
  assert.equal(sunRes.json.data.slots.length, 0);

  // 3. Past date booking rejected (400)
  const pastRes = await invokeApp(app, 'POST', '/api/appointments/book', {
    body: {
      name: 'Test Guest',
      phone: '9876543210',
      appointmentDate: '2026-11-20',
      startTime: '10:00',
      serviceIds: [SVC_1],
      selectionMode: 'any_available',
    },
  });
  assert.equal(pastRes.status, 400);

  // 4. Overlapping slot rejected (409)
  const overlapRes = await invokeApp(app, 'POST', '/api/appointments/book', {
    body: {
      name: 'Test Guest',
      phone: '9876543210',
      appointmentDate: '2026-11-27',
      startTime: '11:00',
      serviceIds: [SVC_1],
      selectionMode: 'specific',
      preferredStaffId: STAFF_1,
    },
  });
  assert.equal(overlapRes.status, 409);

  // 5. Valid future booking succeeds (201) + zero-PII broadcast
  const okRes = await invokeApp(app, 'POST', '/api/appointments/book', {
    body: {
      name: 'Test Guest',
      phone: '9876543210',
      appointmentDate: '2026-11-27',
      startTime: '10:00',
      serviceIds: [SVC_1],
      selectionMode: 'any_available',
    },
  });
  assert.equal(okRes.status, 201);
  assert.equal(okRes.json.data.reference_code, 'APT-261127-ABCD');
  assert.equal(broadcasts[0].action, 'appointment_booked');
  assert.equal('phone' in broadcasts[0], false);

  // 6. Lookup & cancel
  const lookupRes = await invokeApp(app, 'GET', '/api/appointments/lookup?reference=APT-261127-ABCD&phone=9876543210');
  assert.equal(lookupRes.status, 200);
  const cancelRes = await invokeApp(app, 'POST', `/api/appointments/${APPT_1}/cancel`, {
    body: { confirmed: true, phone: '9876543210' },
  });
  assert.equal(cancelRes.status, 200);
});

test('Reception check-in, duplicate check-in block, No Show & Owner zero-PII appointments work', async () => {
  const mockDb = buildMockSupabase({
    existingAppointments: [
      {
        id: APPT_1,
        reference_code: 'APT-261126-ABCD',
        appointment_date: '2099-01-01',
        start_time: '12:00:00',
        end_time: '12:30:00',
        customer_id: CUST_1,
        selection_mode: 'specific',
        assigned_staff_id: STAFF_2,
        status: 'Booked',
        total_duration_minutes: 30,
        total_price_inr: 500,
        queue_entry_id: null,
      },
    ],
  });

  const app = express();
  app.use(express.json());
  app.use(
    '/api/reception',
    createReceptionRouter({
      getSupabase: () => mockDb,
      isConfigured: () => true,
      broadcast: async () => {},
      requireAuth: (_req, _res, next) => next(),
    })
  );
  app.use(
    '/api/owner',
    createOwnerRouter({
      getSupabase: () => mockDb,
      isConfigured: () => true,
      broadcast: async () => {},
      requireAuth: (_req, _res, next) => next(),
    })
  );

  const recAppts = await invokeApp(app, 'GET', '/api/reception/appointments');
  assert.equal(recAppts.status, 200);
  assert.equal(recAppts.json.data.upcoming_appointments[0].customer_phone, '9876543210');

  const ownAppts = await invokeApp(app, 'GET', '/api/owner/appointments');
  assert.equal(ownAppts.status, 200);
  assert.equal('customer_phone' in ownAppts.json.data.upcoming_appointments[0], false);

  const checkInOk = await invokeApp(app, 'POST', `/api/reception/appointments/${APPT_1}/check-in`);
  assert.equal(checkInOk.status, 200);
  const dupCheckIn = await invokeApp(app, 'POST', '/api/reception/appointments/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee/check-in');
  assert.equal(dupCheckIn.status, 409);

  const noShow = await invokeApp(app, 'POST', `/api/reception/appointments/${APPT_1}/no-show`);
  assert.equal(noShow.status, 200);
});

test('Demo access fails closed when disabled and issues signed cookie when explicitly enabled', async () => {
  const prevEnabled = process.env.DEMO_ACCESS_ENABLED;
  const prevPin = process.env.DEMO_RECEPTION_STAFF_PIN;
  const prevHash = process.env.DEMO_RECEPTION_STAFF_PIN_HASH;
  const prevSecret = process.env.PIN_SESSION_SECRET;
  const prevUrl = process.env.SUPABASE_URL;
  const prevKey = process.env.SUPABASE_SECRET_KEY;

  process.env.PIN_SESSION_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'dummy-test-key';
  process.env.DEMO_RECEPTION_STAFF_PIN = '654321';
  process.env.DEMO_RECEPTION_STAFF_PIN_HASH = await hashPin('654321');

  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);

  try {
    // 1. Disabled by default -> 403
    process.env.DEMO_ACCESS_ENABLED = 'false';
    const cfgOff = await invokeApp(app, 'GET', '/api/auth/demo-config');
    assert.equal(cfgOff.json.data.enabled, false);

    const deniedPin = await invokeApp(app, 'POST', '/api/auth/demo/pin-login', {
      body: { scope: 'reception' },
    });
    assert.equal(deniedPin.status, 403);

    const deniedOwner = await invokeApp(app, 'POST', '/api/auth/demo/owner-login');
    assert.equal(deniedOwner.status, 403);

    // 2. Explicitly enabled -> demo-config exposes no secrets, reception pin-login sets cookie
    process.env.DEMO_ACCESS_ENABLED = 'true';
    const cfgOn = await invokeApp(app, 'GET', '/api/auth/demo-config');
    assert.equal(cfgOn.json.data.enabled, true);
    assert.equal(cfgOn.json.data.hasPinDemo, true);
    assert.equal('demoPin' in cfgOn.json.data, false);
    assert.equal(cfgOn.text.includes('scrypt'), false);

    // /api/auth/demo-prefill returns prefill on local loopback when enabled
    const prefillOn = await invokeApp(app, 'GET', '/api/auth/demo-prefill');
    assert.equal(prefillOn.status, 200);
    assert.equal(prefillOn.json.data.pin, '654321');
    assert.equal(prefillOn.text.includes('scrypt'), false);

    const badPin = await invokeApp(app, 'POST', '/api/auth/demo/pin-login', {
      body: { scope: 'reception', pin: '000000' },
    });
    assert.equal(badPin.status, 401);

    const okPin = await invokeApp(app, 'POST', '/api/auth/demo/pin-login', {
      body: { scope: 'reception', pin: '654321' },
    });
    assert.equal(okPin.status, 200);
    assert.equal(Boolean(okPin.headers['set-cookie']), true);

    // 3. Always disabled in production even if DEMO_ACCESS_ENABLED=true
    const prevNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const cfgProd = await invokeApp(app, 'GET', '/api/auth/demo-config');
    assert.equal(cfgProd.json.data.enabled, false);
    const prefillProd = await invokeApp(app, 'GET', '/api/auth/demo-prefill');
    assert.equal(prefillProd.status, 403);
    const deniedProd = await invokeApp(app, 'POST', '/api/auth/demo/pin-login', {
      body: { scope: 'reception', pin: '654321' },
    });
    assert.equal(deniedProd.status, 403);
    process.env.NODE_ENV = prevNodeEnv;
  } finally {
    process.env.DEMO_ACCESS_ENABLED = prevEnabled;
    process.env.DEMO_RECEPTION_STAFF_PIN = prevPin;
    process.env.DEMO_RECEPTION_STAFF_PIN_HASH = prevHash;
    process.env.PIN_SESSION_SECRET = prevSecret;
    process.env.SUPABASE_URL = prevUrl;
    process.env.SUPABASE_SECRET_KEY = prevKey;
  }
});
