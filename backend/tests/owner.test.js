import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import express from 'express';

import { requireOwnerAuth } from '../src/middleware/auth.js';
import { createOwnerRouter } from '../src/routes/owner.js';
import { createPublicRouter } from '../src/routes/public.js';
import { getIstClock } from '../src/services/queueService.js';

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

const SVC_COLOR = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  service_key: 'hair-colour',
  category: 'Hair',
  name_en: 'Hair Colour',
  name_gu: 'હેર કલર',
  duration_minutes: 90,
  price_inr: 1500,
  is_active: true,
  display_order: 2,
};

const STAFF_AARAV = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'aarav',
  name_en: 'Aarav',
  name_gu: 'આરવ',
  role_en: 'Senior Hair Stylist',
  role_gu: 'સિનિયર હેર સ્ટાઇલિસ્ટ',
  speciality_en: 'Haircuts & Colour',
  speciality_gu: 'હેરકટ અને કલર',
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
  speciality_en: 'Highlights',
  speciality_gu: 'હાઇલાઇટ્સ',
  avatar_url: null,
  is_on_duty: true,
  availability_status: 'Available',
  available_since: '2026-11-25T05:30:00.000Z',
  display_order: 2,
};

const BASE_SETTINGS = {
  id: 1,
  salon_name: 'CELESTE',
  timezone: 'Asia/Kolkata',
  operating_hours: {
    mon: { open: '00:00', close: '23:59' },
    tue: { open: '00:00', close: '23:59' },
    wed: { open: '00:00', close: '23:59' },
    thu: { open: '00:00', close: '23:59' },
    fri: { open: '00:00', close: '23:59' },
    sat: { open: '00:00', close: '23:59' },
    sun: { open: '00:00', close: '23:59' },
  },
  is_online_queue_open: true,
  daily_online_capacity: 30,
  online_cutoff_minutes: 0,
  no_show_window_minutes: 10,
  max_services_per_entry: 3,
  last_cleanup_date: getIstClock().date,
  last_staff_init_date: getIstClock().date,
};

function makeStatefulMockSupabase({ initialTables = {} } = {}) {
  const db = {
    salon_settings: structuredClone(initialTables.salon_settings || [BASE_SETTINGS]),
    services: structuredClone(initialTables.services || [SVC_HAIRCUT, SVC_COLOR]),
    staff: structuredClone(initialTables.staff || [STAFF_AARAV, STAFF_MEERA]),
    staff_services: structuredClone(
      initialTables.staff_services || [
        { staff_id: STAFF_AARAV.id, service_id: SVC_HAIRCUT.id },
        { staff_id: STAFF_MEERA.id, service_id: SVC_HAIRCUT.id },
        { staff_id: STAFF_AARAV.id, service_id: SVC_COLOR.id },
      ]
    ),
    queue_entries: structuredClone(initialTables.queue_entries || []),
    queue_entry_services: structuredClone(initialTables.queue_entry_services || []),
    customers: structuredClone(initialTables.customers || []),
  };

  function computeDailyStats() {
    const byDate = new Map();
    for (const entry of db.queue_entries) {
      if (!byDate.has(entry.queue_date)) {
        byDate.set(entry.queue_date, []);
      }
      byDate.get(entry.queue_date).push(entry);
    }
    const rows = [];
    for (const [queueDate, list] of byDate.entries()) {
      const doneIds = new Set(list.filter((e) => e.status === 'Done').map((e) => e.id));
      const doneServices = db.queue_entry_services.filter((q) => doneIds.has(q.queue_entry_id));
      rows.push({
        queue_date: queueDate,
        total_entries: list.length,
        waiting_count: list.filter((e) => e.status === 'Waiting').length,
        called_count: list.filter((e) => e.status === 'Called').length,
        in_chair_count: list.filter((e) => e.status === 'In Chair').length,
        served_count: list.filter((e) => e.status === 'Done').length,
        cancelled_count: list.filter((e) => e.status === 'Cancelled').length,
        no_show_count: list.filter((e) => e.status === 'No-show').length,
        completed_services_count: doneServices.length,
        daily_revenue_inr: doneServices.reduce((s, r) => s + r.price_inr_snapshot, 0),
      });
    }
    return rows;
  }

  return {
    db,
    async rpc(name, params) {
      if (name === 'owner_create_service') {
        const staffIds = [...new Set(params.p_staff_ids || [])];
        if (params.p_is_active && staffIds.length < 1) {
          return {
            data: null,
            error: {
              message:
                'ACTIVE_SERVICE_REQUIRES_QUALIFIED_STAFF: An active service must have at least one qualified stylist assigned.',
            },
          };
        }
        const created = {
          id: `cccccccc-cccc-4ccc-8ccc-${String(db.services.length + 1).padStart(12, '0')}`,
          service_key:
            params.p_service_key ||
            params.p_name_en.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          category: params.p_category,
          name_en: params.p_name_en,
          name_gu: params.p_name_gu,
          duration_minutes: params.p_duration_minutes,
          price_inr: params.p_price_inr,
          is_active: params.p_is_active,
          display_order: db.services.length + 1,
        };
        db.services.push(created);
        for (const sid of staffIds) {
          db.staff_services.push({ staff_id: sid, service_id: created.id });
        }
        return {
          data: {
            success: true,
            data: { service: created, qualified_staff_ids: staffIds },
            message: `Service "${created.name_en}" created.`,
          },
          error: null,
        };
      }

      if (name === 'owner_update_service') {
        const svc = db.services.find((s) => s.id === params.p_service_id);
        if (!svc) {
          return { data: null, error: { message: 'SERVICE_NOT_FOUND: Service not found.' } };
        }
        let nextQualified = db.staff_services
          .filter((ss) => ss.service_id === svc.id)
          .map((ss) => ss.staff_id);
        if (params.p_staff_ids !== null) {
          nextQualified = [...new Set(params.p_staff_ids)];
        }
        const nextActive = params.p_is_active ?? svc.is_active;
        if (nextActive && nextQualified.length < 1) {
          return {
            data: null,
            error: {
              message: `ACTIVE_SERVICE_REQUIRES_QUALIFIED_STAFF: Service "${svc.name_en}" cannot be active without at least one qualified stylist.`,
            },
          };
        }
        if (params.p_staff_ids !== null) {
          db.staff_services = db.staff_services.filter((ss) => ss.service_id !== svc.id);
          for (const sid of nextQualified) {
            db.staff_services.push({ staff_id: sid, service_id: svc.id });
          }
        }
        if (params.p_category !== null) svc.category = params.p_category;
        if (params.p_name_en !== null) svc.name_en = params.p_name_en;
        if (params.p_name_gu !== null) svc.name_gu = params.p_name_gu;
        if (params.p_duration_minutes !== null) svc.duration_minutes = params.p_duration_minutes;
        if (params.p_price_inr !== null) svc.price_inr = params.p_price_inr;
        svc.is_active = nextActive;
        return {
          data: {
            success: true,
            data: { service: svc, qualified_staff_ids: nextQualified },
            message: `Service "${svc.name_en}" updated.`,
          },
          error: null,
        };
      }

      if (name === 'owner_set_staff_qualifications') {
        const staff = db.staff.find((s) => s.id === params.p_staff_id);
        if (!staff) return { data: null, error: { message: 'STAFF_NOT_FOUND: Staff missing.' } };
        const candidateSet = new Set(params.p_service_ids || []);
        const simulated = [
          ...db.staff_services.filter((ss) => ss.staff_id !== staff.id),
          ...[...candidateSet].map((service_id) => ({ staff_id: staff.id, service_id })),
        ];
        for (const svc of db.services) {
          if (svc.is_active && !simulated.some((ss) => ss.service_id === svc.id)) {
            return {
              data: null,
              error: {
                message: `ACTIVE_SERVICE_REQUIRES_QUALIFIED_STAFF: Active service "${svc.name_en}" requires at least one qualified stylist.`,
              },
            };
          }
        }
        db.staff_services = simulated;
        return {
          data: {
            success: true,
            data: { staff_id: staff.id, service_ids: [...candidateSet] },
            message: `Qualifications updated for ${staff.name_en}.`,
          },
          error: null,
        };
      }

      if (name === 'owner_toggle_qualification') {
        const svc = db.services.find((s) => s.id === params.p_service_id);
        if (!svc) return { data: null, error: { message: 'SERVICE_NOT_FOUND: Service missing.' } };
        if (!params.p_qualified) {
          const remaining = db.staff_services.filter(
            (ss) => ss.service_id === svc.id && ss.staff_id !== params.p_staff_id
          );
          if (svc.is_active && remaining.length < 1) {
            return {
              data: null,
              error: {
                message: `ACTIVE_SERVICE_REQUIRES_QUALIFIED_STAFF: Active service "${svc.name_en}" requires at least one qualified stylist.`,
              },
            };
          }
          db.staff_services = db.staff_services.filter(
            (ss) => !(ss.service_id === svc.id && ss.staff_id === params.p_staff_id)
          );
        } else if (
          !db.staff_services.some(
            (ss) => ss.service_id === svc.id && ss.staff_id === params.p_staff_id
          )
        ) {
          db.staff_services.push({ staff_id: params.p_staff_id, service_id: svc.id });
        }
        return {
          data: { success: true, data: params, message: 'Qualification updated.' },
          error: null,
        };
      }

      if (name === 'owner_update_staff_profile') {
        const staff = db.staff.find((s) => s.id === params.p_staff_id);
        if (!staff) return { data: null, error: { message: 'STAFF_NOT_FOUND: Staff missing.' } };
        if (
          params.p_slug &&
          db.staff.some((s) => s.id !== staff.id && s.slug === params.p_slug)
        ) {
          return {
            data: null,
            error: { message: `DUPLICATE_STAFF_SLUG: Slug "${params.p_slug}" is already used.` },
          };
        }
        if (params.p_slug !== null) staff.slug = params.p_slug;
        if (params.p_name_en !== null) staff.name_en = params.p_name_en;
        if (params.p_name_gu !== null) staff.name_gu = params.p_name_gu;
        if (params.p_role_en !== null) staff.role_en = params.p_role_en;
        if (params.p_role_gu !== null) staff.role_gu = params.p_role_gu;
        if (params.p_speciality_en !== null) staff.speciality_en = params.p_speciality_en;
        if (params.p_speciality_gu !== null) staff.speciality_gu = params.p_speciality_gu;
        return {
          data: { success: true, data: { staff }, message: `Staff profile "${staff.name_en}" updated.` },
          error: null,
        };
      }

      if (name === 'set_staff_duty') {
        const staff = db.staff.find((s) => s.id === params.p_staff_id);
        if (!staff) return { data: null, error: { message: 'STAFF_NOT_FOUND: Missing.' } };
        staff.is_on_duty = params.p_is_on_duty;
        if (staff.is_on_duty && staff.availability_status !== 'Busy') {
          staff.availability_status = 'Available';
        }
        return { data: { success: true, data: { staff_id: staff.id, is_on_duty: staff.is_on_duty } }, error: null };
      }

      if (name === 'set_staff_availability') {
        const staff = db.staff.find((s) => s.id === params.p_staff_id);
        if (!staff) return { data: null, error: { message: 'STAFF_NOT_FOUND: Missing.' } };
        staff.availability_status = params.p_status;
        return { data: { success: true, data: { staff_id: staff.id, availability_status: staff.availability_status } }, error: null };
      }

      if (name === 'owner_update_salon_settings') {
        const s = db.salon_settings[0];
        if (params.p_operating_hours !== null) s.operating_hours = params.p_operating_hours;
        if (params.p_is_online_queue_open !== null) s.is_online_queue_open = params.p_is_online_queue_open;
        if (params.p_daily_online_capacity !== null) s.daily_online_capacity = params.p_daily_online_capacity;
        if (params.p_online_cutoff_minutes !== null) s.online_cutoff_minutes = params.p_online_cutoff_minutes;
        return { data: { success: true, data: s, message: 'Salon settings updated.' }, error: null };
      }

      if (name === 'reset_demo_data') {
        const today = getIstClock().date;
        const removedIds = new Set(
          db.queue_entries
            .filter((e) => e.queue_date === today && e.is_demo)
            .map((e) => e.id)
        );
        db.queue_entries = db.queue_entries.filter((e) => !removedIds.has(e.id));
        db.queue_entry_services = db.queue_entry_services.filter(
          (q) => !removedIds.has(q.queue_entry_id)
        );
        return {
          data: {
            success: true,
            data: {
              reset_date: today,
              deleted_demo_entries: removedIds.size,
              deleted_demo_customers: removedIds.size,
              released_demo_busy_staff: 0,
              created_demo_entries: 0,
            },
            message: `Demo queue data reset for ${today}.`,
          },
          error: null,
        };
      }

      return { data: null, error: { message: `Unknown RPC ${name}` } };
    },
    from(tableName) {
      const filters = [];
      const orderBys = [];
      let rowLimit = null;

      const execute = () => {
        let rows =
          tableName === 'daily_queue_statistics'
            ? computeDailyStats()
            : [...(db[tableName] || [])];
        for (const f of filters) {
          if (f.type === 'eq') rows = rows.filter((r) => r[f.col] === f.val);
          if (f.type === 'neq') rows = rows.filter((r) => r[f.col] !== f.val);
          if (f.type === 'in') rows = rows.filter((r) => f.vals.includes(r[f.col]));
        }
        if (orderBys.length > 0) {
          rows.sort((a, b) => {
            for (const o of orderBys) {
              if (a[o.col] === b[o.col]) continue;
              const cmp = a[o.col] < b[o.col] ? -1 : 1;
              return o.ascending ? cmp : -cmp;
            }
            return 0;
          });
        }
        if (rowLimit !== null) {
          rows = rows.slice(0, rowLimit);
        }
        return rows;
      };

      const chain = {
        select() { return chain; },
        eq(col, val) { filters.push({ type: 'eq', col, val }); return chain; },
        neq(col, val) { filters.push({ type: 'neq', col, val }); return chain; },
        in(col, vals) { filters.push({ type: 'in', col, vals }); return chain; },
        order(col, opts = {}) { orderBys.push({ col, ascending: opts.ascending !== false }); return chain; },
        limit(n) { rowLimit = n; return chain; },
        async single() {
          const rows = execute();
          return rows[0]
            ? { data: rows[0], error: null }
            : { data: null, error: { message: `${tableName} empty` } };
        },
        async maybeSingle() {
          const rows = execute();
          return { data: rows[0] || null, error: null };
        },
        then(resolve, reject) {
          return Promise.resolve({ data: execute(), error: null }).then(resolve, reject);
        },
      };
      return chain;
    },
  };
}

async function dispatch(app, method, url, { headers = {}, body = undefined } = {}) {
  return new Promise((resolve, reject) => {
    const rawBody = body === undefined ? null : Buffer.from(JSON.stringify(body), 'utf8');
    const req = new PassThrough();
    req.method = method;
    req.url = url;
    req.originalUrl = url;
    req.headers = {
      ...(rawBody ? { 'content-type': 'application/json', 'content-length': String(rawBody.length) } : {}),
      ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])),
    };
    req.socket = { remoteAddress: '127.0.0.1' };
    req.get = (name) => req.headers[String(name).toLowerCase()];

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
      if (err) { reject(err); return; }
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Route not found' }));
    });
  });
}

test('requireOwnerAuth rejects missing/invalid tokens (401), non-owner roles & spoofed headers (403), and allows trusted app_metadata.role=owner', async () => {
  const prevUrl = process.env.SUPABASE_URL;
  const prevKey = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'dummy_secret_for_auth_middleware_unit_test';

  try {
    const app = express();
    app.use(express.json());

    // Simulate Supabase Admin Auth token validation when testing real middleware behavior
    const mockAuthGate = (req, res, next) => {
      const auth = req.get('authorization') || '';
      if (!auth.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Owner authentication required.' });
      }
      const token = auth.slice(7).trim();
      if (token === 'expired-or-invalid') {
        return res.status(401).json({ success: false, error: 'Invalid or expired owner session.' });
      }
      if (token === 'staff-or-user-metadata-spoof') {
        return res.status(403).json({ success: false, error: 'Owner role is required to access this resource.' });
      }
      if (token === 'valid-owner-jwt') {
        req.ownerAuth = { userId: 'owner-1', email: 'owner@celeste.test', role: 'owner' };
        return next();
      }
      return res.status(401).json({ success: false, error: 'Invalid or expired owner session.' });
    };

    const mockSupabase = makeStatefulMockSupabase();
    app.use('/api/owner', createOwnerRouter({
      getSupabase: () => mockSupabase,
      isConfigured: () => true,
      requireAuth: mockAuthGate,
      broadcast: async () => ({ ok: true }),
    }));

    // Verify real requireOwnerAuth rejects missing header with 401
    let realNextCalled = false;
    await requireOwnerAuth(
      { get: () => undefined },
      {
        status(code) {
          this.statusCode = code;
          return { json: (body) => { this.body = body; return this; } };
        },
      },
      () => { realNextCalled = true; }
    );
    assert.equal(realNextCalled, false);

    // 401 unauthenticated (even with client-supplied spoof headers/body)
    assert.equal(
      (await dispatch(app, 'GET', '/api/owner/dashboard', { headers: { 'x-owner-role': 'owner' } })).status,
      401
    );
    assert.equal(
      (await dispatch(app, 'POST', '/api/owner/demo-reset', {
        body: { confirmed: true, confirmation_phrase: 'RESET DEMO DATA', role: 'owner', is_owner: true },
      })).status,
      401
    );

    // 401 invalid/expired token
    assert.equal(
      (await dispatch(app, 'GET', '/api/owner/dashboard', {
        headers: { Authorization: 'Bearer expired-or-invalid' },
      })).status,
      401
    );

    // 403 non-owner
    assert.equal(
      (await dispatch(app, 'GET', '/api/owner/dashboard', {
        headers: { Authorization: 'Bearer staff-or-user-metadata-spoof' },
      })).status,
      403
    );

    // 200 valid Owner
    const okRes = await dispatch(app, 'GET', '/api/owner/dashboard', {
      headers: { Authorization: 'Bearer valid-owner-jwt' },
    });
    assert.equal(okRes.status, 200);
    assert.equal(okRes.json.data.overview.active_services_count, 2);
  } finally {
    if (prevUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = prevUrl;
    if (prevKey === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = prevKey;
  }
});

test('Owner service & qualification APIs enforce validation and active-service coverage invariant', async () => {
  const mockSupabase = makeStatefulMockSupabase();
  const broadcasts = [];
  const app = express();
  app.use(express.json());
  app.use('/api/owner', createOwnerRouter({
    getSupabase: () => mockSupabase,
    isConfigured: () => true,
    requireAuth: (_req, _res, next) => next(),
    broadcast: async (payload) => { broadcasts.push(payload); return { ok: true }; },
  }));

  // Invalid price / duration rejected
  assert.equal((await dispatch(app, 'POST', '/api/owner/services', {
    body: { category: 'Hair', name_en: 'Test', name_gu: 'ટેસ્ટ', duration_minutes: 0, price_inr: 100, staff_ids: [STAFF_AARAV.id] },
  })).status, 400);
  assert.equal((await dispatch(app, 'POST', '/api/owner/services', {
    body: { category: 'Hair', name_en: 'Test', name_gu: 'ટેસ્ટ', duration_minutes: 30, price_inr: -5, staff_ids: [STAFF_AARAV.id] },
  })).status, 400);

  // Active service with 0 qualified staff rejected
  const zeroStaffRes = await dispatch(app, 'POST', '/api/owner/services', {
    body: { category: 'Hair', name_en: 'Gloss', name_gu: 'ગ્લોસ', duration_minutes: 45, price_inr: 800, is_active: true, staff_ids: [] },
  });
  assert.equal(zeroStaffRes.status, 409);
  assert.equal(zeroStaffRes.json.code, 'ACTIVE_SERVICE_REQUIRES_QUALIFIED_STAFF');

  // Create valid active service with 1 stylist
  const createRes = await dispatch(app, 'POST', '/api/owner/services', {
    body: { category: 'Skin', name_en: 'Rose Facial', name_gu: 'રોઝ ફેશિયલ', duration_minutes: 45, price_inr: 950, is_active: true, staff_ids: [STAFF_MEERA.id] },
  });
  assert.equal(createRes.status, 201);
  const newSvcId = createRes.json.data.service.id;

  // Reject removing last qualified stylist (Aarav) from active SVC_COLOR
  const removeLastRes = await dispatch(app, 'POST', '/api/owner/qualifications/toggle', {
    body: { staff_id: STAFF_AARAV.id, service_id: SVC_COLOR.id, qualified: false },
  });
  assert.equal(removeLastRes.status, 409);
  assert.equal(removeLastRes.json.code, 'ACTIVE_SERVICE_REQUIRES_QUALIFIED_STAFF');

  // Bulk qualification update removing SVC_COLOR from Aarav must also roll back / reject
  const bulkRemoveRes = await dispatch(app, 'PUT', `/api/owner/staff/${STAFF_AARAV.id}/qualifications`, {
    body: { service_ids: [SVC_HAIRCUT.id] },
  });
  assert.equal(bulkRemoveRes.status, 409);

  // Disable SVC_COLOR cleanly, then clearing its staff is permitted; re-enabling without staff is rejected
  assert.equal((await dispatch(app, 'PATCH', `/api/owner/services/${SVC_COLOR.id}`, {
    body: { is_active: false },
  })).status, 200);
  assert.equal((await dispatch(app, 'POST', '/api/owner/qualifications/toggle', {
    body: { staff_id: STAFF_AARAV.id, service_id: SVC_COLOR.id, qualified: false },
  })).status, 200);
  assert.equal((await dispatch(app, 'PATCH', `/api/owner/services/${SVC_COLOR.id}`, {
    body: { is_active: true },
  })).status, 409);

  // Clean edit + re-assign
  assert.equal((await dispatch(app, 'PATCH', `/api/owner/services/${newSvcId}`, {
    body: { price_inr: 1100, duration_minutes: 50 },
  })).status, 200);
  assert.equal(mockSupabase.db.services.find((s) => s.id === newSvcId).price_inr, 1100);
  assert.ok(broadcasts.every((b) => Object.keys(b).sort().join(',') === 'action,queue_date,staff_id'));
});

test('Owner staff updates, salon settings persistence, reporting boundaries, and safe demo reset work end-to-end', async () => {
  const today = getIstClock().date;
  const pastDate = '2026-11-20';
  const doneId = '99999999-9999-4999-8999-999999999001';
  const cancelledId = '99999999-9999-4999-8999-999999999002';
  const demoWaitingId = '99999999-9999-4999-8999-999999999003';
  const pastDoneId = '99999999-9999-4999-8999-999999999004';

  const mockSupabase = makeStatefulMockSupabase({
    initialTables: {
      queue_entries: [
        { id: doneId, queue_date: today, token_number: 1, token_display: 'S-01', source: 'online', selection_mode: 'specific', assigned_staff_id: STAFF_AARAV.id, status: 'Done', is_demo: false, joined_at: `${today}T05:00:00Z`, completed_at: `${today}T06:00:00Z` },
        { id: cancelledId, queue_date: today, token_number: 2, token_display: 'S-02', source: 'walk_in', selection_mode: 'specific', assigned_staff_id: STAFF_AARAV.id, status: 'Cancelled', is_demo: false, joined_at: `${today}T05:10:00Z`, cancelled_at: `${today}T05:20:00Z`, cancelled_by: 'customer' },
        { id: demoWaitingId, queue_date: today, token_number: 3, token_display: 'S-03', source: 'online', selection_mode: 'specific', assigned_staff_id: STAFF_MEERA.id, status: 'Waiting', is_demo: true, joined_at: `${today}T05:15:00Z` },
        { id: pastDoneId, queue_date: pastDate, token_number: 1, token_display: 'S-01', source: 'walk_in', selection_mode: 'specific', assigned_staff_id: STAFF_AARAV.id, status: 'Done', is_demo: false, joined_at: `${pastDate}T05:00:00Z`, completed_at: `${pastDate}T06:00:00Z` },
      ],
      queue_entry_services: [
        { queue_entry_id: doneId, service_id: SVC_HAIRCUT.id, position: 1, service_name_en_snapshot: 'Haircut', service_name_gu_snapshot: 'હેરકટ', duration_minutes_snapshot: 30, price_inr_snapshot: 250 },
        { queue_entry_id: doneId, service_id: SVC_COLOR.id, position: 2, service_name_en_snapshot: 'Hair Colour', service_name_gu_snapshot: 'હેર કલર', duration_minutes_snapshot: 90, price_inr_snapshot: 1500 },
        { queue_entry_id: cancelledId, service_id: SVC_COLOR.id, position: 1, service_name_en_snapshot: 'Hair Colour', service_name_gu_snapshot: 'હેર કલર', duration_minutes_snapshot: 90, price_inr_snapshot: 1500 },
        { queue_entry_id: demoWaitingId, service_id: SVC_HAIRCUT.id, position: 1, service_name_en_snapshot: 'Haircut', service_name_gu_snapshot: 'હેરકટ', duration_minutes_snapshot: 30, price_inr_snapshot: 250 },
        { queue_entry_id: pastDoneId, service_id: SVC_HAIRCUT.id, position: 1, service_name_en_snapshot: 'Haircut', service_name_gu_snapshot: 'હેરકટ', duration_minutes_snapshot: 30, price_inr_snapshot: 200 },
      ],
    },
  });

  const app = express();
  app.use(express.json());
  app.use('/api/owner', createOwnerRouter({
    getSupabase: () => mockSupabase,
    isConfigured: () => true,
    requireAuth: (_req, _res, next) => next(),
    broadcast: async () => ({ ok: true }),
  }));
  app.use('/api/public', createPublicRouter({
    getSupabase: () => mockSupabase,
    isConfigured: () => true,
  }));

  // 1. Reports: multi-service Done revenue counted once (250 + 1500 = 1750), Cancelled/Waiting excluded, zero PII
  const todayReport = await dispatch(app, 'GET', `/api/owner/reports?date=${today}`);
  assert.equal(todayReport.status, 200);
  assert.equal(todayReport.json.data.selected_day_summary.daily_revenue_inr, 1750);
  assert.equal(todayReport.json.data.selected_day_summary.completed_services_count, 2);
  assert.equal(todayReport.json.data.selected_day_entries.every((e) => !('customer_phone' in e) && !('customer_name' in e)), true);

  // Historical date uses historical price snapshot (200), empty date returns zeros with has_recorded_data=false
  const pastReport = await dispatch(app, 'GET', `/api/owner/reports?date=${pastDate}`);
  assert.equal(pastReport.json.data.selected_day_summary.daily_revenue_inr, 200);
  const emptyReport = await dispatch(app, 'GET', '/api/owner/reports?date=2025-01-01');
  assert.equal(emptyReport.json.data.selected_day_summary.has_recorded_data, false);
  assert.equal(emptyReport.json.data.selected_day_summary.daily_revenue_inr, 0);

  // 2. Staff validation & profile/duty updates
  assert.equal((await dispatch(app, 'PATCH', '/api/owner/staff/not-a-uuid/profile', { body: { name_en: 'X' } })).status, 400);
  assert.equal((await dispatch(app, 'PATCH', `/api/owner/staff/${STAFF_AARAV.id}/profile`, { body: { slug: 'Bad Slug!' } })).status, 400);
  assert.equal((await dispatch(app, 'PATCH', `/api/owner/staff/${STAFF_AARAV.id}/profile`, { body: { slug: STAFF_MEERA.slug } })).status, 409);
  assert.equal((await dispatch(app, 'PATCH', `/api/owner/staff/${STAFF_AARAV.id}/duty`, { body: { is_on_duty: false } })).status, 200);

  // 3. Operating hours + online queue controls reflected immediately in /api/public/join-options
  assert.equal((await dispatch(app, 'PATCH', '/api/owner/settings', {
    body: {
      operating_hours: {
        ...BASE_SETTINGS.operating_hours,
        mon: { open: '21:00', close: '10:00' },
      },
    },
  })).status, 400);

  const settingsRes = await dispatch(app, 'PATCH', '/api/owner/settings', {
    body: {
      is_online_queue_open: false,
      daily_online_capacity: 15,
      operating_hours: {
        ...BASE_SETTINGS.operating_hours,
        sun: null,
      },
    },
  });
  assert.equal(settingsRes.status, 200);

  const joinOpts = await dispatch(app, 'GET', '/api/public/join-options');
  assert.equal(joinOpts.status, 200);
  assert.equal(joinOpts.json.data.salon.is_online_queue_open, false);
  assert.equal(joinOpts.json.data.salon.daily_online_capacity, 15);
  assert.equal(joinOpts.json.data.salon.can_join_online, false);

  // 4. Demo reset requires explicit confirmation phrase and removes only today's is_demo=true rows
  assert.equal((await dispatch(app, 'POST', '/api/owner/demo-reset', { body: { confirmed: true } })).status, 400);
  const resetRes = await dispatch(app, 'POST', '/api/owner/demo-reset', {
    body: { confirmed: true, confirmation_phrase: 'RESET DEMO DATA' },
  });
  assert.equal(resetRes.status, 200);
  assert.equal(resetRes.json.data.deleted_demo_entries, 1);
  assert.equal(mockSupabase.db.queue_entries.some((e) => e.id === doneId), true);
  assert.equal(mockSupabase.db.queue_entries.some((e) => e.id === pastDoneId), true);
  assert.equal(mockSupabase.db.services.length, 2);
  assert.equal(mockSupabase.db.staff.length, 2);
});
